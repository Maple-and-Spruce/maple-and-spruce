/**
 * The behaviours under test are the ones that decide whether a studio's
 * schedule is right: that re-running creates nothing, that a skipped week stays
 * skipped, and that a pre-schedule lesson is never duplicated beside a
 * materialised one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findSchedules: vi.fn(),
  findStudents: vi.fn(),
  findLessons: vi.fn(),
  createWithId: vi.fn(),
  findConflictsForWindow: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  return {
    // The room-conflict check (legacy #841). Free by default; the room-conflict
    // cases below override it. Mocked rather than exercised because the
    // real one reads calendar events, and that belongs in the integration
    // suite where a trigger actually writes them.
    findConflictsForWindow: mocks.findConflictsForWindow,
  };
});

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}));

vi.mock('@maple/firebase/database', () => ({
  StudentLessonScheduleRepository: { findAll: mocks.findSchedules },
  StudentRepository: { findAll: mocks.findStudents },
  LessonRepository: {
    findAll: mocks.findLessons,
    createWithId: mocks.createWithId,
  },
}));

import { runMaterializeLessonSchedules } from './materialize-lesson-schedules';

const NOW = new Date('2026-06-01T12:00:00Z'); // a Monday

const schedule = {
  id: 'sched-1',
  studentId: 'student-1',
  teacherId: 'teacher-1',
  blockId: 'block-1',
  dayOfWeek: 2, // Tuesday
  startMinutes: 16 * 60,
  durationMinutes: 30,
  startsOn: new Date('2026-01-01T00:00:00Z'),
  endsOn: undefined,
  status: 'active' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

const activeStudent = {
  id: 'student-1',
  name: 'Rowan',
  status: 'active',
  primaryTeacherId: 'teacher-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  // The room is free unless a test says otherwise (legacy #841).
  mocks.findConflictsForWindow.mockResolvedValue([]);
  mocks.findSchedules.mockResolvedValue([schedule]);
  mocks.findStudents.mockResolvedValue([activeStudent]);
  mocks.findLessons.mockResolvedValue([]);
  mocks.createWithId.mockImplementation(async (id: string) => ({ id }));
});

describe('runMaterializeLessonSchedules', () => {
  it('makes the next lessons, one per week', async () => {
    const result = await runMaterializeLessonSchedules(NOW, 4);

    expect(result.created).toBe(4);
    expect(result.schedulesConsidered).toBe(1);

    // Deterministic ids, one per occurrence date.
    const ids = mocks.createWithId.mock.calls.map((c) => c[0]);
    expect(new Set(ids).size).toBe(4);
    expect(ids.every((id: string) => id.startsWith('sched-sched-1-'))).toBe(
      true
    );
  });

  it('stamps the schedule and block onto every lesson it makes', async () => {
    await runMaterializeLessonSchedules(NOW, 2);

    const [, payload] = mocks.createWithId.mock.calls[0];
    expect(payload).toMatchObject({
      studentId: 'student-1',
      teacherId: 'teacher-1',
      blockId: 'block-1',
      scheduleId: 'sched-1',
      durationMinutes: 30,
      status: 'scheduled',
      primaryTeacherAtCreateId: 'teacher-1',
    });
  });

  it('creates nothing on a second run', async () => {
    // The whole scheme rests on this: the lessons the first run made are the
    // four ahead, so the second run has nothing to add.
    await runMaterializeLessonSchedules(NOW, 4);
    const made = mocks.createWithId.mock.calls.map(([id, payload]) => ({
      id,
      ...payload,
    }));
    mocks.createWithId.mockClear();
    mocks.findLessons.mockResolvedValue(made);

    const result = await runMaterializeLessonSchedules(NOW, 4);

    expect(result.created).toBe(0);
    expect(mocks.createWithId).not.toHaveBeenCalled();
  });

  it('does not refill a week that was cancelled', async () => {
    // Skipping a week is cancelling that lesson. The document still exists, so
    // its id collides and nothing recreates it — no exceptions table needed.
    mocks.createWithId.mockResolvedValue(null);

    const result = await runMaterializeLessonSchedules(NOW, 1);

    expect(result.created).toBe(0);
  });

  it('never duplicates a lesson the student already has at that instant', async () => {
    // Lessons from before schedules existed do not have the deterministic id,
    // so the id check alone would not catch them. This is the second defence,
    // and the one that stops a migration doubling somebody's week.
    const firstTuesday = new Date('2026-06-02T20:00:00Z'); // 4pm ET
    mocks.findLessons.mockResolvedValue([
      {
        id: 'legacy-lesson',
        studentId: 'student-1',
        scheduledAt: firstTuesday,
      },
    ]);

    const result = await runMaterializeLessonSchedules(NOW, 1);

    expect(result.created).toBe(0);
    expect(result.alreadyPresent).toBe(1);
    expect(mocks.createWithId).not.toHaveBeenCalled();
  });

  it('skips a student who has left', async () => {
    mocks.findStudents.mockResolvedValue([
      { ...activeStudent, status: 'inactive' },
    ]);

    const result = await runMaterializeLessonSchedules(NOW, 4);

    expect(result.created).toBe(0);
    expect(result.skippedInactiveStudent).toBe(1);
    expect(mocks.createWithId).not.toHaveBeenCalled();
  });

  it('skips a schedule whose student no longer exists', async () => {
    mocks.findStudents.mockResolvedValue([]);

    const result = await runMaterializeLessonSchedules(NOW, 4);

    expect(result.created).toBe(0);
    expect(result.skippedInactiveStudent).toBe(1);
  });

  it('creates nothing past an end date', async () => {
    mocks.findSchedules.mockResolvedValue([
      { ...schedule, endsOn: new Date('2026-06-10T00:00:00Z') },
    ]);

    const result = await runMaterializeLessonSchedules(NOW, 8);

    // Only Jun 2 and Jun 9 fall inside the window and before the end date.
    expect(result.created).toBe(2);
  });

  it('asks the repository only for active schedules', async () => {
    await runMaterializeLessonSchedules(NOW, 1);
    expect(mocks.findSchedules).toHaveBeenCalledWith({ status: 'active' });
  });
});

describe('keeping four lessons ahead', () => {
  /** A lesson this arrangement already made, `weeks` Tuesdays from NOW. */
  const made = (weeks: number, status = 'scheduled') => ({
    id: `made-${weeks}`,
    studentId: 'student-1',
    scheduleId: 'sched-1',
    scheduledAt: new Date(
      new Date('2026-06-02T20:00:00Z').getTime() + weeks * 7 * 86_400_000
    ),
    status,
  });

  it('keeps four upcoming lessons by default, not twelve weeks of them', async () => {
    const result = await runMaterializeLessonSchedules(NOW);
    expect(result.created).toBe(4);
  });

  it('tops up to four when some are already on the books', async () => {
    mocks.findLessons.mockResolvedValue([made(0), made(1)]);

    const result = await runMaterializeLessonSchedules(NOW);

    expect(result.created).toBe(2);
  });

  it('never removes lessons when more than four are already ahead', async () => {
    // Students scheduled under the old twelve-week horizon keep what they
    // have; nothing is added until they are down to four.
    mocks.findLessons.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => made(i))
    );

    const result = await runMaterializeLessonSchedules(NOW);

    expect(result.created).toBe(0);
    expect(mocks.createWithId).not.toHaveBeenCalled();
  });

  it('pulls the next date in behind a cancelled week', async () => {
    // Week 1 was skipped. Four lessons should still be happening, so the
    // fifth Tuesday is added rather than leaving three.
    mocks.findLessons.mockResolvedValue([
      made(0),
      made(1, 'cancelled'),
      made(2),
      made(3),
    ]);

    const result = await runMaterializeLessonSchedules(NOW);

    expect(result.created).toBe(1);
    expect(mocks.createWithId.mock.calls[0][0]).toContain('2026-06-30');
  });

  it('fills only the named arrangement when asked', async () => {
    mocks.findSchedules.mockResolvedValue([
      schedule,
      { ...schedule, id: 'sched-2', studentId: 'student-1', startMinutes: 17 * 60 },
    ]);

    const result = await runMaterializeLessonSchedules(NOW, 4, 'sched-2');

    expect(result.schedulesConsidered).toBe(1);
    expect(result.created).toBe(4);
    expect(
      mocks.createWithId.mock.calls.every(([id]) => id.startsWith('sched-sched-2-'))
    ).toBe(true);
  });

  it('keeps four ahead for a fortnightly student, not two', async () => {
    mocks.findSchedules.mockResolvedValue([{ ...schedule, intervalWeeks: 2 }]);

    const result = await runMaterializeLessonSchedules(NOW);

    expect(result.created).toBe(4);
  });
});

describe('room conflicts (legacy #841)', () => {
  it('checks an arrangement with no room against Spruce, and books it there', async () => {
    // The calendar puts a room-less lesson in Spruce, so the check has to look
    // at Spruce too — or the lesson is written over whatever holds it (#156).
    await runMaterializeLessonSchedules(NOW, 1);

    expect(mocks.findConflictsForWindow).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'spruce' })
    );
    expect(mocks.createWithId).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ room: 'spruce' })
    );
  });

  it('skips an occurrence whose room is taken, and counts it', async () => {
    // This job runs unattended. Throwing would abandon every remaining
    // arrangement; writing anyway would double-book the room. So it skips,
    // and the count is what tells a human a slot needs attention.
    mocks.findConflictsForWindow.mockResolvedValue([
      {
        room: 'spruce',
        event: {
          id: 'evt-1',
          title: 'Private rental',
          startDateTime: new Date(),
          endDateTime: new Date(),
          sourceRef: null,
        },
      },
    ]);

    const result = await runMaterializeLessonSchedules(NOW);

    expect(result.created).toBe(0);
    expect(result.skippedRoomConflict).toBeGreaterThan(0);
  });
});
