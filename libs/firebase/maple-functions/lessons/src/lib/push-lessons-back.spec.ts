/**
 * Push a lesson and every later one back a week, together.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent, Lesson } from '@maple/ts/domain';

const mocks = vi.hoisted(() => ({
  assertCanManageLesson: vi.fn(),
  resolveLessonBlock: vi.fn(),
  findConflictsForWindow: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  assertCanManageLesson: mocks.assertCanManageLesson,
  resolveLessonBlock: mocks.resolveLessonBlock,
  findConflictsForWindow: mocks.findConflictsForWindow,
  throwFailedPrecondition: (message: string) => {
    throw new Error(message);
  },
  throwInvalidArgument: (message: string) => {
    throw new Error(message);
  },
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  LessonRepository: {
    findById: mocks.findById,
    findAll: mocks.findAll,
    update: mocks.update,
  },
}));

import { pushLessonsBack } from './push-lessons-back';

const ctx = { uid: 'teacher-uid' } as never;

function lesson(id: string, iso: string, overrides: Partial<Lesson> = {}): Lesson {
  return {
    id,
    studentId: 'stu-1',
    teacherId: 'teacher-1',
    scheduledAt: new Date(iso),
    durationMinutes: 60,
    blockId: 'block-tue',
    room: 'spruce',
    status: 'scheduled',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  };
}

/** A room booking as `onLessonWrite` would mirror it. */
function eventFor(l: Lesson): RoomConflictLike {
  return {
    room: 'spruce',
    event: {
      id: `lesson-${l.id}`,
      title: 'Music Lesson',
      startDateTime: l.scheduledAt,
      endDateTime: new Date(l.scheduledAt.getTime() + l.durationMinutes * 60_000),
      sourceRef: `lessons/${l.id}`,
    },
  };
}
type RoomConflictLike = {
  room: 'spruce';
  event: Pick<CalendarEvent, 'id' | 'title' | 'startDateTime' | 'endDateTime' | 'sourceRef'>;
};

// Tue Oct 27 (EDT) and Tue Nov 3 (EST), both at noon in the studio.
const oct27 = lesson('les-oct27', '2026-10-27T16:00:00Z');
const nov3 = lesson('les-nov3', '2026-11-03T17:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  mocks.findById.mockImplementation(async (id: string) =>
    [oct27, nov3].find((l) => l.id === id),
  );
  mocks.findAll.mockResolvedValue([oct27, nov3]);
  mocks.resolveLessonBlock.mockImplementation(async ({ blockId }) => blockId);
  mocks.findConflictsForWindow.mockResolvedValue([]);
  mocks.update.mockImplementation(async ({ id, ...changes }) => ({
    ...[oct27, nov3].find((l) => l.id === id),
    ...changes,
  }));
});

describe('pushLessonsBack', () => {
  it('moves the lesson and the later one a week, keeping noon across the clock change', async () => {
    const result = await pushLessonsBack({ lessonId: oct27.id }, ctx);

    expect(mocks.update.mock.calls.map(([u]) => [u.id, u.scheduledAt.toISOString()])).toEqual([
      // Latest first, so neither is ever written onto the other.
      ['les-nov3', '2026-11-10T17:00:00.000Z'],
      ['les-oct27', '2026-11-03T17:00:00.000Z'],
    ]);
    expect(result.lessons.map((l) => l.id)).toEqual(['les-oct27', 'les-nov3']);
  });

  it("is not stopped by the student's own lessons that are moving", async () => {
    // Nov 3 is still in the room when Oct 27's new time is checked.
    mocks.findConflictsForWindow.mockImplementation(async ({ scheduledAt }) =>
      scheduledAt.getTime() === nov3.scheduledAt.getTime() ? [eventFor(nov3)] : [],
    );

    await pushLessonsBack({ lessonId: oct27.id }, ctx);

    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it("refuses, moving nothing, when someone else's booking is in the way", async () => {
    const other = lesson('other-student', '2026-11-10T17:00:00Z', {
      studentId: 'stu-2',
    });
    mocks.findConflictsForWindow.mockImplementation(async ({ scheduledAt }) =>
      scheduledAt.getTime() === other.scheduledAt.getTime() ? [eventFor(other)] : [],
    );

    await expect(pushLessonsBack({ lessonId: oct27.id }, ctx)).rejects.toThrow(
      /Tue, Nov 10: Spruce Room is already taken/,
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('refuses, moving nothing, when a new date falls outside the block', async () => {
    mocks.resolveLessonBlock.mockImplementation(async ({ scheduledAts }) => {
      if (scheduledAts[0].toISOString() === '2026-11-03T17:00:00.000Z') {
        throw new Error('That time is outside the block');
      }
      return 'block-tue';
    });

    await expect(pushLessonsBack({ lessonId: oct27.id }, ctx)).rejects.toThrow(
      'Tue, Nov 3: That time is outside the block',
    );
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('checks the teacher may manage the lessons before moving them', async () => {
    mocks.assertCanManageLesson.mockRejectedValueOnce(new Error('not yours'));

    await expect(pushLessonsBack({ lessonId: oct27.id }, ctx)).rejects.toThrow('not yours');
    expect(mocks.assertCanManageLesson).toHaveBeenCalledWith(ctx, 'teacher-1');
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not check the room for a lesson held online', async () => {
    mocks.findAll.mockResolvedValue([{ ...oct27, virtual: true }]);
    mocks.findById.mockResolvedValue({ ...oct27, virtual: true });

    await pushLessonsBack({ lessonId: oct27.id }, ctx);

    expect(mocks.findConflictsForWindow).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it('moves by more than a week when asked', async () => {
    mocks.findAll.mockResolvedValue([oct27]);

    await pushLessonsBack({ lessonId: oct27.id, weeks: 2 }, ctx);

    expect(mocks.update.mock.calls[0][0].scheduledAt.toISOString()).toBe(
      '2026-11-10T17:00:00.000Z',
    );
  });

  it.each([0, 5, 1.5])('refuses %s weeks', async (weeks) => {
    await expect(pushLessonsBack({ lessonId: oct27.id, weeks }, ctx)).rejects.toThrow(
      'Lessons can be pushed back 1 to 4 weeks.',
    );
  });

  it('refuses a lesson that is not scheduled', async () => {
    mocks.findById.mockResolvedValue({ ...oct27, status: 'cancelled' });
    await expect(pushLessonsBack({ lessonId: oct27.id }, ctx)).rejects.toThrow(
      'Only a lesson that is still scheduled can be pushed back.',
    );
  });

  it('refuses a lesson that has already happened', async () => {
    vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
    await expect(pushLessonsBack({ lessonId: oct27.id }, ctx)).rejects.toThrow(
      'A lesson that has already happened cannot be pushed back.',
    );
  });

  it('reports a missing lesson', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(pushLessonsBack({ lessonId: 'nope' }, ctx)).rejects.toThrow(
      'Lesson nope not found',
    );
  });
});
