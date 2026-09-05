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
}));

vi.mock('@maple/firebase/functions', () => {
  const builder = {
    requiringRole: () => builder,
    handle: <TReq, TRes>(handler: (d: TReq, c: unknown) => Promise<TRes>) =>
      handler,
  };
  return { Functions: { endpoint: builder }, Role: { Admin: 'admin' } };
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
  mocks.findSchedules.mockResolvedValue([schedule]);
  mocks.findStudents.mockResolvedValue([activeStudent]);
  mocks.findLessons.mockResolvedValue([]);
  mocks.createWithId.mockImplementation(async (id: string) => ({ id }));
});

describe('runMaterializeLessonSchedules', () => {
  it('fills the horizon with one lesson per week', async () => {
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
    // The whole scheme rests on this: a collision is the steady state, not an
    // error. createWithId returns null when the id already exists.
    mocks.createWithId.mockResolvedValue(null);

    const result = await runMaterializeLessonSchedules(NOW, 4);

    expect(result.created).toBe(0);
    expect(result.alreadyPresent).toBe(4);
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
