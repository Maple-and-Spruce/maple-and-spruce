/**
 * The room a new series occupies (#156): every lesson in a series that names
 * no room is checked against, and stored as, Spruce — the room the calendar
 * already puts it in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  assertRoomIsFree: vi.fn(),
  resolveLessonBlock: vi.fn(),
  findStudent: vi.fn(),
  createSeries: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  Role: { Admin: 'admin', LessonTeacher: 'lesson-teacher' },
  createRoleFunction: <Req, Res>(
    handler: (data: Req, ctx: unknown) => Promise<Res>,
  ) => handler,
  assertCanManageLesson: vi.fn(),
  assertRoomIsFree: mocks.assertRoomIsFree,
  resolveLessonBlock: mocks.resolveLessonBlock,
}));

vi.mock('@maple/firebase/database', () => ({
  StudentRepository: { findById: mocks.findStudent },
  LessonRepository: { createSeries: mocks.createSeries },
}));

import { createLessonSeries } from './create-lesson-series';

const handler = createLessonSeries as unknown as (
  data: Record<string, unknown>,
  ctx: unknown,
) => Promise<unknown>;

// Far enough ahead that the series is never treated as a backfill.
const DATES = ['2030-11-05T21:00:00.000Z', '2030-11-12T21:00:00.000Z'];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.assertRoomIsFree.mockResolvedValue(undefined);
  mocks.resolveLessonBlock.mockResolvedValue('blk-1');
  mocks.findStudent.mockResolvedValue({
    id: 'stu-1',
    primaryTeacherId: 'teacher-1',
  });
  mocks.createSeries.mockResolvedValue({ lessons: [], seriesId: 'series-1' });
});

describe('createLessonSeries room', () => {
  it('checks every date of a series with no room against Spruce, and stores it as Spruce', async () => {
    await handler(
      {
        studentId: 'stu-1',
        teacherId: 'teacher-1',
        durationMinutes: 30,
        scheduledAts: DATES,
        blockId: 'blk-1',
      },
      {},
    );

    expect(mocks.assertRoomIsFree).toHaveBeenCalledWith(
      DATES.map((d) =>
        expect.objectContaining({ room: 'spruce', scheduledAt: new Date(d) }),
      ),
    );
    expect(mocks.createSeries).toHaveBeenCalledWith(
      expect.objectContaining({ room: 'spruce' }),
    );
  });
});
