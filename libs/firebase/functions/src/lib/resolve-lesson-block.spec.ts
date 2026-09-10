/**
 * Deriving and widening blocks from a scheduling call (#835).
 *
 * Two things are worth proving here, and neither is arithmetic:
 *
 *   1. **A derived block never claims more than its source.** A one-off lesson
 *      must not mint standing weekly availability, because `get-my-week` reads
 *      blocks as exactly that.
 *   2. **Only Katie reshapes the standing week.** `createLessonBlock` is
 *      admin-only on purpose; deriving a block from a lesson call must not hand
 *      lesson-teachers that power through the side door.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LessonBlock } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  hasRole: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  LessonBlockRepository: {
    findById: mocks.findById,
    findAll: mocks.findAll,
    create: mocks.create,
    update: mocks.update,
  },
}));

vi.mock('./auth.utility', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./auth.utility')>()),
  hasRole: mocks.hasRole,
}));

import { resolveLessonBlock } from './lesson-block.utility';

const TEACHER = 'instr-nathan';

/** Tuesdays 4:00–5:00 pm ET. */
const tueBlock: LessonBlock = {
  id: 'blk-tue',
  teacherId: TEACHER,
  dayOfWeek: 2,
  startMinutes: 16 * 60,
  endMinutes: 17 * 60,
  createdAt: new Date(),
  updatedAt: new Date(),
};

/** 2026-07-21 is a Tuesday; EDT is UTC-4. */
const tueAt = (h: number, m = 0) => new Date(Date.UTC(2026, 6, 21, h + 4, m));

const ADMIN = { uid: 'uid-katie' };
const TEACHER_CTX = { uid: 'uid-nathan' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findAll.mockResolvedValue([tueBlock]);
  mocks.hasRole.mockResolvedValue(true); // admin unless a test says otherwise
  // findById backs the final fit re-check; hand back whatever was written.
  mocks.create.mockImplementation(async (input: Partial<LessonBlock>) => {
    const created = { ...input, id: 'blk-new' } as LessonBlock;
    mocks.findById.mockResolvedValue(created);
    return created;
  });
  mocks.update.mockImplementation(async (input: Partial<LessonBlock>) => {
    const updated = { ...tueBlock, ...input } as LessonBlock;
    mocks.findById.mockResolvedValue(updated);
    return updated;
  });
});

const call = (over: Record<string, unknown> = {}) =>
  resolveLessonBlock({
    strategy: { mode: 'create' },
    teacherId: TEACHER,
    scheduledAts: [tueAt(19)], // 7pm — nowhere near the 4–5 block
    durationMinutes: 30,
    recurring: false,
    context: ADMIN,
    ...over,
  } as Parameters<typeof resolveLessonBlock>[0]);

describe('no strategy — the pre-#835 contract is untouched', () => {
  it('still refuses a lesson with no block', async () => {
    await expect(
      call({ strategy: undefined, blockId: null })
    ).rejects.toThrow(/must be attributed to a block/i);
  });

  it('validates an explicitly chosen block as before', async () => {
    mocks.findById.mockResolvedValue(tueBlock);
    const id = await call({
      strategy: { mode: 'existing', blockId: 'blk-tue' },
      scheduledAts: [tueAt(16)],
    });
    expect(id).toBe('blk-tue');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('create — what the derived block claims', () => {
  it('derives a ONE-OFF block for a single lesson', async () => {
    await call({ recurring: false });

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      teacherId: TEACHER,
      dayOfWeek: 2,
      startMinutes: 19 * 60,
      endMinutes: 19 * 60 + 30,
      onDate: '2026-07-21',
    });
  });

  it('derives a RECURRING block for a standing arrangement', async () => {
    await call({ recurring: true });

    expect(mocks.create.mock.calls[0][0].onDate).toBeUndefined();
  });

  it('refuses a lesson that runs past midnight instead of writing a bad block', async () => {
    await expect(
      call({ scheduledAts: [tueAt(23, 45)], durationMinutes: 30 })
    ).rejects.toThrow(/past midnight/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('create — who may reshape the standing week', () => {
  it('lets a lesson teacher derive a one-off block for their own lesson', async () => {
    // Grants nothing beyond creating the lesson, which they can already do.
    mocks.hasRole.mockResolvedValue(false);

    await expect(
      call({ recurring: false, context: TEACHER_CTX })
    ).resolves.toBe('blk-new');
  });

  it('refuses a lesson teacher a RECURRING block', async () => {
    // createLessonBlock is admin-only on purpose: only Katie shapes the
    // schedule. Deriving one must not be a way around that.
    mocks.hasRole.mockResolvedValue(false);

    await expect(
      call({ recurring: true, context: TEACHER_CTX })
    ).rejects.toThrow(/only an admin can add a weekly block/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe('extend', () => {
  it('widens the weekly window for an admin', async () => {
    await call({
      strategy: { mode: 'extend', blockId: 'blk-tue', scope: 'weekly' },
      scheduledAts: [tueAt(17)], // 5:00–5:30, abutting the block
    });

    expect(mocks.update).toHaveBeenCalledWith({
      id: 'blk-tue',
      startMinutes: 16 * 60,
      endMinutes: 17 * 60 + 30,
    });
  });

  it('refuses a lesson teacher the weekly widening', async () => {
    mocks.hasRole.mockResolvedValue(false);

    await expect(
      call({
        strategy: { mode: 'extend', blockId: 'blk-tue', scope: 'weekly' },
        scheduledAts: [tueAt(17)],
        context: TEACHER_CTX,
      })
    ).rejects.toThrow(/only an admin can change a weekly block/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('leaves the weekly block alone for "just this date"', async () => {
    mocks.hasRole.mockResolvedValue(false);

    await call({
      strategy: { mode: 'extend', blockId: 'blk-tue', scope: 'this-date' },
      scheduledAts: [tueAt(17)],
      context: TEACHER_CTX,
    });

    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      startMinutes: 16 * 60,
      endMinutes: 17 * 60 + 30,
      onDate: '2026-07-21',
    });
  });

  it('refuses "just this date" for a weekly arrangement', async () => {
    // A one-off block covers one date, so every week after the first would
    // come back unattributed. Refused before anything is written.
    await expect(
      call({
        strategy: { mode: 'extend', blockId: 'blk-tue', scope: 'this-date' },
        scheduledAts: [tueAt(17)],
        recurring: true,
      })
    ).rejects.toThrow(/weekly arrangement needs a weekly block/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('refuses to widen a block that is not actually a candidate', async () => {
    // 8pm is more than an hour past the 4–5 block. Without this the call
    // would stretch the block across three hours nobody teaches.
    await expect(
      call({
        strategy: { mode: 'extend', blockId: 'blk-tue', scope: 'weekly' },
        scheduledAts: [tueAt(20)],
      })
    ).rejects.toThrow(/can no longer be extended/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('every occurrence is re-checked, not just the one planned from', () => {
  it('rejects a series whose later date falls outside the derived block', async () => {
    // Planning uses the first occurrence; this proves the rest are still
    // verified against what was actually created.
    mocks.findAll.mockResolvedValue([]);

    await expect(
      call({
        recurring: true,
        // Same weekday, but the second is an hour later than the first.
        scheduledAts: [tueAt(19), new Date(Date.UTC(2026, 6, 28, 20 + 4))],
      })
    ).rejects.toThrow(/outside the selected block/i);
  });
});
