/**
 * Moving a lesson saved before rooms existed (#156). It has no `room`, but the
 * calendar holds it in Spruce, so a reschedule must be checked against Spruce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertRoomIsFree: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  createRoleFunction: <Req, Res>(handler: (data: Req, ctx: unknown) => Promise<Res>) =>
    handler,
  assertCanManageLesson: vi.fn(),
  assertRoomIsFree: mocks.assertRoomIsFree,
  resolveLessonBlock: vi.fn(),
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  LessonRepository: { findById: mocks.findById, update: mocks.update },
  LessonScheduledChargeRepository: { findAll: vi.fn().mockResolvedValue([]) },
}));

import { updateLesson } from './update-lesson';

const handler = updateLesson as unknown as (
  data: Record<string, unknown>,
  ctx: unknown
) => Promise<unknown>;

/** No `room` key at all — the shape of a lesson written before rooms. */
const preRoomLesson = {
  id: 'lesson-old',
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date('2026-11-03T21:00:00Z'),
  durationMinutes: 30,
  blockId: null,
  status: 'scheduled',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertRoomIsFree.mockResolvedValue(undefined);
  mocks.findById.mockResolvedValue(preRoomLesson);
  mocks.update.mockImplementation(async (u: object) => ({ ...preRoomLesson, ...u }));
});

describe('updateLesson room', () => {
  it('checks a reschedule of a lesson with no room against Spruce', async () => {
    const to = '2026-11-03T22:00:00.000Z';

    await handler({ id: 'lesson-old', scheduledAt: to }, {});

    expect(mocks.assertRoomIsFree).toHaveBeenCalledWith([
      {
        room: 'spruce',
        scheduledAt: new Date(to),
        durationMinutes: 30,
        excludeSourceRef: 'lessons/lesson-old',
      },
    ]);
  });

  it('does not re-check a notes edit', async () => {
    await handler({ id: 'lesson-old', notes: 'ran long' }, {});

    expect(mocks.assertRoomIsFree).not.toHaveBeenCalled();
  });
});
