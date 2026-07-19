import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for onLessonRenderedInvoice — mocks the Firestore trigger wrapper,
 * the repositories, and the rate resolver so the handler runs as a plain fn.
 */

const mocks = vi.hoisted(() => ({
  onDocumentWritten: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  create: vi.fn(),
  getRatesConfig: vi.fn(),
  resolveRate: vi.fn(),
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((config, handler) => {
    mocks.onDocumentWritten(config, handler);
    return handler;
  }),
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findById: mocks.findById },
  InvoiceRepository: {
    findAll: mocks.findAll,
    create: mocks.create,
    createAutoLessonInvoice: mocks.create,
  },
  LessonRatesConfigRepository: { get: mocks.getRatesConfig },
}));

vi.mock('@maple/ts/domain', () => ({
  resolvePrivatePayLessonRateCents: mocks.resolveRate,
}));

import { onLessonRenderedInvoice } from './on-lesson-rendered-invoice';

type Handler = (event: unknown) => Promise<void>;
const handler = onLessonRenderedInvoice as unknown as Handler;

function makeEvent(
  beforeStatus: string | undefined,
  afterData: Record<string, unknown> | null,
  lessonId = 'lesson-1'
): unknown {
  return {
    params: { lessonId },
    data: {
      before: { data: () => (beforeStatus ? { status: beforeStatus } : undefined) },
      after: {
        exists: afterData !== null,
        id: lessonId,
        data: () => afterData ?? undefined,
      },
    },
  };
}

const renderedLesson = {
  studentId: 'student-1',
  scheduledAt: new Date('2026-07-10T15:00:00'),
  durationMinutes: 30,
  teacherId: 'teacher-1',
  status: 'rendered',
};

const autoStudent = {
  id: 'student-1',
  name: 'Juniper',
  isHopeScholarship: false,
  autoInvoice: true,
  registeredLessonLength: '30-min-full',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue(autoStudent);
  mocks.findAll.mockResolvedValue([]);
  mocks.create.mockResolvedValue({ id: 'inv-new' });
  mocks.getRatesConfig.mockResolvedValue({ rateByLength: { '30-min-full': 4125 } });
  mocks.resolveRate.mockReturnValue(4125);
});

describe('onLessonRenderedInvoice', () => {
  it('creates + sends an invoice on scheduled→rendered for an autoInvoice student', async () => {
    await handler(makeEvent('scheduled', renderedLesson));

    expect(mocks.create).toHaveBeenCalledTimes(1);
    // createAutoLessonInvoice(lessonId, input) — lessonId first, input second.
    expect(mocks.create.mock.calls[0][0]).toBe('lesson-1');
    const arg = mocks.create.mock.calls[0][1];
    expect(arg.studentId).toBe('student-1');
    expect(arg.status).toBe('sent');
    expect(arg.lineItems).toHaveLength(1);
    expect(arg.lineItems[0]).toMatchObject({
      lessonId: 'lesson-1',
      quantity: 1,
      unitAmountCents: 4125,
      subtotalCents: 4125,
    });
  });

  it('is idempotent: skips silently when the invoice already exists (concurrent delivery)', async () => {
    // createAutoLessonInvoice returns null when the deterministic-id create()
    // loses the race — the trigger must not throw or double-process.
    mocks.create.mockResolvedValue(null);

    await expect(
      handler(makeEvent('scheduled', renderedLesson))
    ).resolves.toBeUndefined();

    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the status was already rendered (no transition)', async () => {
    await handler(makeEvent('rendered', renderedLesson));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('does nothing when the new status is not rendered', async () => {
    await handler(
      makeEvent('scheduled', { ...renderedLesson, status: 'cancelled' })
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does nothing for a student without autoInvoice', async () => {
    mocks.findById.mockResolvedValue({ ...autoStudent, autoInvoice: false });
    await handler(makeEvent('scheduled', renderedLesson));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('never auto-invoices a Hope Scholarship student', async () => {
    mocks.findById.mockResolvedValue({
      ...autoStudent,
      isHopeScholarship: true,
    });
    await handler(makeEvent('scheduled', renderedLesson));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('is idempotent — skips when the lesson is already on an invoice', async () => {
    mocks.findAll.mockResolvedValue([
      {
        status: 'sent',
        lineItems: [{ lessonId: 'lesson-1', unitAmountCents: 4125 }],
      },
    ]);
    await handler(makeEvent('scheduled', renderedLesson));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('still invoices when the only prior invoice for this lesson was voided', async () => {
    mocks.findAll.mockResolvedValue([
      { status: 'void', lineItems: [{ lessonId: 'lesson-1' }] },
    ]);
    await handler(makeEvent('scheduled', renderedLesson));
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it('skips when no positive rate resolves (no price configured)', async () => {
    mocks.resolveRate.mockReturnValue(0);
    await handler(makeEvent('scheduled', renderedLesson));
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does nothing when the lesson was deleted (no after doc)', async () => {
    await handler(makeEvent('scheduled', null));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
