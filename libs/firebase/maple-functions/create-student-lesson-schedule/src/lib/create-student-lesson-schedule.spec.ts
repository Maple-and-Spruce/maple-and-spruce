import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  capturedHandler: null as
    | ((d: unknown, c: unknown) => Promise<unknown>)
    | null,
  findStudent: vi.fn(),
  createSchedule: vi.fn(),
  createLesson: vi.fn(),
  createLessonWithId: vi.fn(),
  assertCanManageLesson: vi.fn(),
  resolveLessonBlock: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  class HttpsError extends Error {
    constructor(public code: string, m: string) {
      super(m);
    }
  }
  const endpoint = {
    requiringRole: vi.fn(() => endpoint),
    handle: vi.fn((h: typeof mocks.capturedHandler) => {
      mocks.capturedHandler = h;
      return 'mock';
    }),
  };
  return {
    Functions: { endpoint },
    Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
    assertCanManageLesson: mocks.assertCanManageLesson,
    resolveLessonBlock: mocks.resolveLessonBlock,
    throwInvalidArgument: (m: string) => {
      throw new HttpsError('invalid-argument', m);
    },
    throwNotFound: (e: string, id: string) => {
      throw new HttpsError('not-found', `${e} ${id} not found`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findById: mocks.findStudent },
  StudentLessonScheduleRepository: { create: mocks.createSchedule },
  // Present only so the test can prove nothing touches it.
  LessonRepository: {
    create: mocks.createLesson,
    createWithId: mocks.createLessonWithId,
  },
}));

import './create-student-lesson-schedule';

const request = {
  studentId: 'stu-1',
  teacherId: 'teacher-1',
  blockId: 'block-1',
  dayOfWeek: 2,
  startMinutes: 16 * 60,
  durationMinutes: 30,
  startsOn: '2026-10-06T04:00:00.000Z',
};

const run = (data: unknown) => mocks.capturedHandler!(data, { uid: 'u' });

describe('createStudentLessonSchedule (#157)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findStudent.mockResolvedValue({ id: 'stu-1', status: 'active' });
    mocks.resolveLessonBlock.mockResolvedValue('block-1');
    mocks.createSchedule.mockImplementation(async (input) => ({
      id: 'sched-1',
      ...input,
    }));
  });

  it('records the weekly time and books no lessons', async () => {
    const result = (await run(request)) as { schedule: { id: string } };

    expect(result).toEqual({
      schedule: expect.objectContaining({ id: 'sched-1', dayOfWeek: 2 }),
    });
    expect(mocks.createSchedule).toHaveBeenCalledTimes(1);
    expect(mocks.createLesson).not.toHaveBeenCalled();
    expect(mocks.createLessonWithId).not.toHaveBeenCalled();
  });

  it('still checks the weekly time fits a block before saving it', async () => {
    await run(request);

    expect(mocks.resolveLessonBlock).toHaveBeenCalledWith(
      expect.objectContaining({ teacherId: 'teacher-1', recurring: true })
    );
  });

  it('refuses an end date before the start date', async () => {
    await expect(
      run({ ...request, endsOn: '2026-10-01T04:00:00.000Z' })
    ).rejects.toThrow('The end date is before the start date');
    expect(mocks.createSchedule).not.toHaveBeenCalled();
  });

  it('refuses an unknown student', async () => {
    mocks.findStudent.mockResolvedValue(undefined);

    await expect(run(request)).rejects.toThrow('not found');
  });
});
