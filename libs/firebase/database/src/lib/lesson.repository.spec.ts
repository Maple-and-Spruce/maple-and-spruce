import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./utilities/database.config', () => ({
  db: { collection: vi.fn() },
  toDate: (value: unknown): Date =>
    value instanceof Date ? value : new Date(value as string),
}));

import { LessonRepository } from './lesson.repository';
import { db } from './utilities/database.config';

/** Wire `db.collection(…).doc(…).create()` to whatever the test needs. */
function mockCreate(impl: () => Promise<unknown>) {
  const create = vi.fn(impl);
  (db.collection as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    doc: vi.fn(() => ({ create })),
  });
  return create;
}

const INPUT = {
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date('2026-09-28T20:00:00Z'),
  durationMinutes: 30,
  status: 'scheduled' as const,
};

/**
 * `createWithId` is how a standing arrangement is materialised, and a collision
 * on its deterministic id is the **steady state**: re-running finds the lesson
 * already there, a skipped week stays skipped, a moved week is not refilled.
 *
 * All of that depends on the collision being reported as `null` rather than
 * thrown, because every caller sits inside an all-or-nothing loop. Matching only
 * the gRPC code meant a REST 409 escaped and took every standing arrangement
 * down with it (#117) — so each transport gets its own case here.
 */
describe('materialising a lesson onto a known id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the lesson when the id was free', async () => {
    mockCreate(() => Promise.resolve(undefined));
    const lesson = await LessonRepository.createWithId('sched-a-2026-09-28', INPUT);
    expect(lesson?.id).toBe('sched-a-2026-09-28');
  });

  it('returns null on the gRPC form of the collision', async () => {
    mockCreate(() => Promise.reject({ code: 6, message: 'already exists' }));
    await expect(
      LessonRepository.createWithId('sched-a-2026-09-28', INPUT)
    ).resolves.toBeNull();
  });

  it('returns null on the REST form, which is what dev and prod send', async () => {
    // The shape that actually escaped: `code` is 409, not 6, so the old guard
    // rethrew and `createStudentLessonSchedule` failed for an unrelated student.
    mockCreate(() =>
      Promise.reject({
        code: 409,
        status: 'ALREADY_EXISTS',
        message:
          'Document already exists: projects/p/databases/(default)/documents/lessons/sched-a-2026-09-28',
      })
    );
    await expect(
      LessonRepository.createWithId('sched-a-2026-09-28', INPUT)
    ).resolves.toBeNull();
  });

  it('still throws anything that is not a collision', async () => {
    // Swallowing a permission error would report a write that never happened as
    // "already there", which is worse than the throw.
    mockCreate(() =>
      Promise.reject({ code: 7, message: 'PERMISSION_DENIED' })
    );
    await expect(
      LessonRepository.createWithId('sched-a-2026-09-28', INPUT)
    ).rejects.toMatchObject({ code: 7 });
  });
});
