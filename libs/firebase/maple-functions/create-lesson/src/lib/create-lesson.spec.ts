/**
 * The room a new lesson occupies (#156). A lesson that names no room is
 * mirrored into Spruce by `onLessonWrite`, so it has to be checked against
 * Spruce and stored as Spruce — anything else lets it double-book the room.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertRoomIsFree: vi.fn(),
  resolveLessonBlock: vi.fn(),
  findStudent: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  createRoleFunction: <Req, Res>(handler: (data: Req, ctx: unknown) => Promise<Res>) =>
    handler,
  assertCanManageLesson: vi.fn(),
  assertRoomIsFree: mocks.assertRoomIsFree,
  resolveLessonBlock: mocks.resolveLessonBlock,
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findById: mocks.findStudent },
  LessonRepository: { create: mocks.create },
}));

import { createLesson } from './create-lesson';

const handler = createLesson as unknown as (
  data: Record<string, unknown>,
  ctx: unknown
) => Promise<unknown>;

const AT = '2026-11-03T21:00:00.000Z';

const request = (over: Record<string, unknown> = {}) => ({
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  scheduledAt: AT,
  durationMinutes: 30,
  status: 'scheduled',
  blockId: 'blk-1',
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertRoomIsFree.mockResolvedValue(undefined);
  mocks.resolveLessonBlock.mockResolvedValue('blk-1');
  mocks.findStudent.mockResolvedValue({ id: 'stu-1', primaryTeacherId: 'teacher-1' });
  mocks.create.mockImplementation(async (input: object) => ({ id: 'lesson-1', ...input }));
});

describe('createLesson room', () => {
  it('checks a lesson with no room against Spruce', async () => {
    await handler(request(), {});

    expect(mocks.assertRoomIsFree).toHaveBeenCalledWith([
      expect.objectContaining({ room: 'spruce', scheduledAt: new Date(AT) }),
    ]);
  });

  it('stores a lesson with no room as Spruce', async () => {
    await handler(request(), {});

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'spruce' })
    );
  });

  it('refuses before writing when Spruce is taken', async () => {
    mocks.assertRoomIsFree.mockRejectedValue(new Error('Spruce Room is already taken'));

    await expect(handler(request(), {})).rejects.toThrow(/already taken/);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
