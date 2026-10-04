/**
 * A standing arrangement that names no room is recorded as Spruce (#156), so
 * every lesson it materialises is stamped — and room-checked — as Spruce, the
 * room the calendar already puts it in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  handler: null as
    | ((data: unknown, ctx: unknown) => Promise<unknown>)
    | null,
  findStudent: vi.fn(),
  createSchedule: vi.fn(),
  materialize: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    requiringRole: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.handler) => {
      mocks.handler = h;
      return 'mock';
    }),
  };
  return {
    Functions: { endpoint },
    Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
    assertCanManageLesson: vi.fn(),
    resolveLessonBlock: vi.fn().mockResolvedValue('blk-1'),
    throwInvalidArgument: (m: string) => {
      throw new Error(m);
    },
    throwNotFound: (e: string, id: string) => {
      throw new Error(`${e} ${id} not found`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findById: mocks.findStudent },
  StudentLessonScheduleRepository: { create: mocks.createSchedule },
}));

vi.mock('@maple/firebase/maple-functions/materialize-lesson-schedules', () => ({
  runMaterializeLessonSchedules: mocks.materialize,
}));

import './create-student-lesson-schedule';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findStudent.mockResolvedValue({ id: 'stu-1', primaryTeacherId: 'teacher-1' });
  mocks.createSchedule.mockImplementation(async (input: object) => ({
    id: 'sched-1',
    ...input,
  }));
  mocks.materialize.mockResolvedValue({ created: 4 });
});

describe('createStudentLessonSchedule room', () => {
  it('records an arrangement with no room as Spruce', async () => {
    await mocks.handler!(
      {
        studentId: 'stu-1',
        teacherId: 'teacher-1',
        dayOfWeek: 2,
        startMinutes: 16 * 60,
        durationMinutes: 30,
        startsOn: '2030-01-01T00:00:00.000Z',
        blockId: 'blk-1',
      },
      {}
    );

    expect(mocks.createSchedule).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'spruce' })
    );
  });
});
