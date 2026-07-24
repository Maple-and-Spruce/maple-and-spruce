import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LessonBlock } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({ findById: vi.fn() }));

vi.mock('@maple/firebase/database', () => ({
  LessonBlockRepository: { findById: mocks.findById },
}));

import { assertLessonsFitBlock } from './lesson-block.utility';

const block: LessonBlock = {
  id: 'block-tue',
  teacherId: 'instr-nathan',
  dayOfWeek: 2, // Tuesday
  startMinutes: 15 * 60,
  endMinutes: 18 * 60,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const tueAfternoon = new Date('2026-07-21T20:00:00Z'); // Tue 16:00 EDT

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue(block);
});

describe('assertLessonsFitBlock', () => {
  it('rejects a missing blockId', async () => {
    await expect(
      assertLessonsFitBlock({
        blockId: null,
        teacherId: 'instr-nathan',
        scheduledAts: [tueAfternoon],
        durationMinutes: 30,
      })
    ).rejects.toThrow(/must be attributed to a block/i);
    expect(mocks.findById).not.toHaveBeenCalled();
  });

  it('rejects a block that does not exist', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(
      assertLessonsFitBlock({
        blockId: 'gone',
        teacherId: 'instr-nathan',
        scheduledAts: [tueAfternoon],
        durationMinutes: 30,
      })
    ).rejects.toThrow(/Block not found/i);
  });

  it('rejects a block owned by a different teacher', async () => {
    await expect(
      assertLessonsFitBlock({
        blockId: 'block-tue',
        teacherId: 'instr-someone-else',
        scheduledAts: [tueAfternoon],
        durationMinutes: 30,
      })
    ).rejects.toThrow(/different teacher/i);
  });

  it('rejects when any lesson in the series falls outside the window', async () => {
    const badMonday = new Date('2026-07-20T20:00:00Z'); // Mon
    await expect(
      assertLessonsFitBlock({
        blockId: 'block-tue',
        teacherId: 'instr-nathan',
        scheduledAts: [tueAfternoon, badMonday],
        durationMinutes: 30,
      })
    ).rejects.toThrow(/outside the selected block/i);
  });

  it('passes when the block owns the teacher and every lesson fits', async () => {
    const anotherTue = new Date('2026-07-28T21:00:00Z'); // Tue 17:00 EDT
    await expect(
      assertLessonsFitBlock({
        blockId: 'block-tue',
        teacherId: 'instr-nathan',
        scheduledAts: [tueAfternoon, anotherTue],
        durationMinutes: 30,
      })
    ).resolves.toBeUndefined();
  });
});
