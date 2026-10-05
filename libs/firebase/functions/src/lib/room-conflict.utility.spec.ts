import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findByRoomInRange: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: { findByRoomInRange: mocks.findByRoomInRange },
}));

import { assertRoomIsFree, findConflictsForWindow } from './room-conflict.utility';

const AT = new Date('2026-11-03T21:00:00Z');

/** A lesson already holding Spruce for the hour starting at AT. */
const spruceLesson = {
  id: 'evt-held',
  title: 'Music Lesson',
  type: 'lesson',
  room: 'spruce',
  startDateTime: AT,
  endDateTime: new Date(AT.getTime() + 60 * 60_000),
  sourceRef: 'lessons/held',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findByRoomInRange.mockResolvedValue([]);
});

describe('findConflictsForWindow', () => {
  it('reads the room the window names', async () => {
    mocks.findByRoomInRange.mockResolvedValue([spruceLesson]);

    const conflicts = await findConflictsForWindow({
      room: 'spruce',
      scheduledAt: AT,
      durationMinutes: 30,
    });

    expect(mocks.findByRoomInRange).toHaveBeenCalledWith(
      'spruce',
      AT,
      new Date(AT.getTime() + 30 * 60_000)
    );
    expect(conflicts).toHaveLength(1);
  });

  it('ignores the booking\'s own event', async () => {
    mocks.findByRoomInRange.mockResolvedValue([spruceLesson]);

    const conflicts = await findConflictsForWindow({
      room: 'spruce',
      scheduledAt: AT,
      durationMinutes: 60,
      excludeSourceRef: 'lessons/held',
    });

    expect(conflicts).toEqual([]);
  });
});

describe('assertRoomIsFree', () => {
  it('refuses a window whose room is taken', async () => {
    mocks.findByRoomInRange.mockResolvedValue([spruceLesson]);

    await expect(
      assertRoomIsFree([{ room: 'spruce', scheduledAt: AT, durationMinutes: 60 }])
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('lets a free window through', async () => {
    await expect(
      assertRoomIsFree([{ room: 'spruce', scheduledAt: AT, durationMinutes: 60 }])
    ).resolves.toBeUndefined();
  });
});
