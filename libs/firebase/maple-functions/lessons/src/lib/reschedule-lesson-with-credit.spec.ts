/**
 * Cancel a lesson and book its replacement, moving the payment over (#209).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Invoice, Lesson, LessonScheduledCharge } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  assertCanManageLesson: vi.fn(),
  assertRoomIsFree: vi.fn(),
  resolveLessonBlock: vi.fn(),
  lessons: new Map<string, unknown>(),
  createWithId: vi.fn(),
  update: vi.fn(),
  chargesFindAll: vi.fn(),
  moveCoveredLesson: vi.fn(),
  invoicesFindAll: vi.fn(),
  moveLineLesson: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  assertCanManageLesson: mocks.assertCanManageLesson,
  assertRoomIsFree: mocks.assertRoomIsFree,
  resolveLessonBlock: mocks.resolveLessonBlock,
  throwInvalidArgument: (message: string) => {
    throw new Error(message);
  },
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  LessonRepository: {
    findById: async (id: string) => mocks.lessons.get(id),
    createWithId: mocks.createWithId,
    update: mocks.update,
  },
  LessonScheduledChargeRepository: {
    findAll: mocks.chargesFindAll,
    moveCoveredLesson: mocks.moveCoveredLesson,
  },
  InvoiceRepository: {
    findAll: mocks.invoicesFindAll,
    moveLineLesson: mocks.moveLineLesson,
  },
}));

import { rescheduleLessonWithCredit } from './reschedule-lesson-with-credit';

const ctx = { uid: 'admin-uid' } as never;
const newTime = new Date('2026-11-12T21:00:00Z');

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 'les-1',
    studentId: 'stu-1',
    teacherId: 'teacher-1',
    primaryTeacherAtCreateId: 'teacher-1',
    scheduledAt: new Date('2026-11-05T21:00:00Z'),
    durationMinutes: 30,
    blockId: 'block-thu',
    room: 'spruce',
    status: 'scheduled',
    creditForLessonId: null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
    ...overrides,
  };
}

function charge(overrides: Partial<LessonScheduledCharge> = {}) {
  return {
    id: 'chg-stu-1-les-0',
    studentId: 'stu-1',
    status: 'paid',
    lessonIds: ['les-0', 'les-1', 'les-2', 'les-3'],
    ...overrides,
  } as LessonScheduledCharge;
}

function invoice(overrides: Partial<Invoice> = {}) {
  return {
    id: 'inv-1',
    studentId: 'stu-1',
    status: 'sent',
    lineItems: [{ id: 'line-1', lessonId: 'les-1', description: 'Lesson' }],
    ...overrides,
  } as Invoice;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lessons.clear();
  mocks.lessons.set('les-1', lesson());
  mocks.resolveLessonBlock.mockResolvedValue('block-thu');
  mocks.createWithId.mockImplementation(async (id: string, input: object) => {
    const created = { id, ...input };
    mocks.lessons.set(id, created);
    return created;
  });
  mocks.update.mockImplementation(async (u: { id: string }) => ({
    ...(mocks.lessons.get(u.id) as object),
    ...u,
  }));
  mocks.chargesFindAll.mockResolvedValue([]);
  mocks.invoicesFindAll.mockResolvedValue([]);
});

describe('rescheduleLessonWithCredit', () => {
  it('books the replacement as a credit for the cancelled lesson', async () => {
    const result = await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime },
      ctx,
    );

    expect(mocks.createWithId).toHaveBeenCalledWith('les-1-credit', {
      studentId: 'stu-1',
      teacherId: 'teacher-1',
      scheduledAt: newTime,
      durationMinutes: 30,
      status: 'scheduled',
      room: 'spruce',
      blockId: 'block-thu',
      primaryTeacherAtCreateId: 'teacher-1',
      creditForLessonId: 'les-1',
    });
    expect(result.replacement.id).toBe('les-1-credit');
    expect(mocks.update).toHaveBeenCalledWith({ id: 'les-1', status: 'cancelled' });
    expect(result.cancelled.status).toBe('cancelled');
  });

  it('accepts the date as an ISO string, the way it arrives over the wire', async () => {
    await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime.toISOString() as never },
      ctx,
    );
    expect(mocks.createWithId.mock.calls[0][1].scheduledAt).toEqual(newTime);
  });

  it('moves a paid card charge onto the replacement', async () => {
    mocks.chargesFindAll.mockResolvedValue([charge()]);

    const result = await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime },
      ctx,
    );

    expect(mocks.moveCoveredLesson).toHaveBeenCalledWith(
      'chg-stu-1-les-0',
      'les-1',
      'les-1-credit',
    );
    expect(result.coverage).toBe('charge');
  });

  it('moves an invoice line onto the replacement', async () => {
    mocks.invoicesFindAll.mockResolvedValue([invoice()]);

    const result = await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime },
      ctx,
    );

    expect(mocks.moveLineLesson).toHaveBeenCalledWith(
      'inv-1',
      'les-1',
      'les-1-credit',
    );
    expect(result.coverage).toBe('invoice');
  });

  it('leaves a voided invoice and a charge for other lessons alone', async () => {
    mocks.invoicesFindAll.mockResolvedValue([invoice({ status: 'void' })]);
    mocks.chargesFindAll.mockResolvedValue([
      charge({ lessonIds: ['les-5', 'les-6'] }),
    ]);

    const result = await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime },
      ctx,
    );

    expect(mocks.moveLineLesson).not.toHaveBeenCalled();
    expect(mocks.moveCoveredLesson).not.toHaveBeenCalled();
    expect(result.coverage).toBe('none');
  });

  it('on a retry, finds the replacement and the moved payment instead of redoing them', async () => {
    mocks.lessons.set(
      'les-1-credit',
      lesson({ id: 'les-1-credit', scheduledAt: newTime, creditForLessonId: 'les-1' }),
    );
    mocks.chargesFindAll.mockResolvedValue([
      charge({ lessonIds: ['les-0', 'les-1-credit', 'les-2', 'les-3'] }),
    ]);

    const result = await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime },
      ctx,
    );

    expect(mocks.createWithId).not.toHaveBeenCalled();
    expect(mocks.moveCoveredLesson).not.toHaveBeenCalled();
    expect(result.coverage).toBe('charge');
  });

  it('can credit a lesson that was already cancelled', async () => {
    mocks.lessons.set('les-1', lesson({ status: 'cancelled' }));

    const result = await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime },
      ctx,
    );

    expect(mocks.update).not.toHaveBeenCalled();
    expect(result.replacement.creditForLessonId).toBe('les-1');
  });

  it('refuses to credit a replacement — move it instead', async () => {
    mocks.lessons.set('les-1', lesson({ creditForLessonId: 'les-0' }));

    await expect(
      rescheduleLessonWithCredit({ lessonId: 'les-1', scheduledAt: newTime }, ctx),
    ).rejects.toThrow(/Move it instead/);
    expect(mocks.createWithId).not.toHaveBeenCalled();
  });

  it('refuses a lesson marked as taught', async () => {
    mocks.lessons.set('les-1', lesson({ status: 'rendered' }));

    await expect(
      rescheduleLessonWithCredit({ lessonId: 'les-1', scheduledAt: newTime }, ctx),
    ).rejects.toThrow(/taught/);
  });

  it("checks the teacher may manage the lesson before touching anything", async () => {
    mocks.assertCanManageLesson.mockRejectedValueOnce(new Error('not yours'));

    await expect(
      rescheduleLessonWithCredit({ lessonId: 'les-1', scheduledAt: newTime }, ctx),
    ).rejects.toThrow('not yours');
    expect(mocks.assertCanManageLesson).toHaveBeenCalledWith(ctx, 'teacher-1');
    expect(mocks.createWithId).not.toHaveBeenCalled();
  });

  it('books nothing and cancels nothing when the room is taken', async () => {
    mocks.assertRoomIsFree.mockRejectedValueOnce(new Error('room busy'));

    await expect(
      rescheduleLessonWithCredit({ lessonId: 'les-1', scheduledAt: newTime }, ctx),
    ).rejects.toThrow('room busy');
    expect(mocks.createWithId).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('uses the block strategy the caller planned for the new time', async () => {
    const blockStrategy = { mode: 'create' } as const;
    await rescheduleLessonWithCredit(
      { lessonId: 'les-1', scheduledAt: newTime, blockStrategy },
      ctx,
    );
    expect(mocks.resolveLessonBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy: blockStrategy,
        blockId: 'block-thu',
        scheduledAts: [newTime],
        recurring: false,
      }),
    );
  });
});
