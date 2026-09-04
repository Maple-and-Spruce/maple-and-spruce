/**
 * The point of these tests is the guard, not the write.
 *
 * Hope pays only for services rendered. If a no-show ever reaches a submission
 * the studio has claimed public money for a lesson nobody attended, so the
 * check lives on the server and is proven here rather than trusted to whatever
 * the UI happens to send.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findLesson: vi.fn(),
  findStudent: vi.fn(),
  findSubmission: vi.fn(),
  record: vi.fn(),
}));

// Unwrap the fluent builder so the spec drives the handler directly, the same
// way the other function specs in this repo do.
vi.mock('@maple/firebase/functions', () => {
  const builder = {
    requiringRole: () => builder,
    usingSecrets: () => builder,
    usingStrings: () => builder,
    withOptions: () => builder,
    handle: <TReq, TRes>(handler: (d: TReq, c: unknown) => Promise<TRes>) =>
      handler,
  };
  return {
    Functions: { endpoint: builder },
    Role: { Admin: 'admin' },
    throwInvalidArgument: (message: string) => {
      throw new Error(`invalid-argument: ${message}`);
    },
  };
});

vi.mock('@maple/firebase/database', () => ({
  LessonRepository: { findById: mocks.findLesson },
  StudentRepository: { findById: mocks.findStudent },
  HopeSubmissionRepository: {
    findById: mocks.findSubmission,
    record: mocks.record,
  },
}));

import { recordHopeSubmissions } from './record-hope-submissions';

type Handler = (
  data: unknown,
  context?: unknown
) => Promise<{
  recordedLessonIds: string[];
  skipped: Array<{ lessonId: string; reason: string }>;
}>;

const handler = recordHopeSubmissions as unknown as Handler;

const renderedLesson = {
  id: 'lesson-1',
  studentId: 'student-1',
  teacherId: 'teacher-1',
  scheduledAt: new Date('2026-08-01T15:00:00Z'),
  durationMinutes: 30,
  status: 'rendered',
};

const hopeStudent = {
  id: 'student-1',
  name: 'Rowan',
  isHopeScholarship: true,
  registeredLessonLength: '30-min-full',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLesson.mockResolvedValue(renderedLesson);
  mocks.findStudent.mockResolvedValue(hopeStudent);
  mocks.findSubmission.mockResolvedValue(undefined);
  mocks.record.mockResolvedValue(undefined);
});

describe('recordHopeSubmissions', () => {
  it('records a claim for a rendered Hope lesson at the tier rate', async () => {
    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(result.recordedLessonIds).toEqual(['lesson-1']);
    expect(mocks.record).toHaveBeenCalledTimes(1);
    const [payload] = mocks.record.mock.calls[0];
    expect(payload).toMatchObject({
      lessonId: 'lesson-1',
      status: 'submitted',
      rateCents: 4125, // 30-min-full
      recordedByUid: 'admin-1',
    });
  });

  it('refuses to claim a no-show — Hope pays only for services rendered', async () => {
    mocks.findLesson.mockResolvedValue({
      ...renderedLesson,
      status: 'no-show',
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(result.recordedLessonIds).toEqual([]);
    expect(result.skipped[0].reason).toMatch(/rendered/i);
  });

  it('refuses to claim a cancelled lesson', async () => {
    mocks.findLesson.mockResolvedValue({
      ...renderedLesson,
      status: 'cancelled',
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(result.skipped).toHaveLength(1);
  });

  it('refuses to claim for a student who is not on Hope', async () => {
    mocks.findStudent.mockResolvedValue({
      ...hopeStudent,
      isHopeScholarship: false,
    });

    const result = await handler(
      { lessonIds: ['lesson-1'], status: 'submitted' },
      { uid: 'admin-1' }
    );

    expect(mocks.record).not.toHaveBeenCalled();
    expect(result.skipped[0].reason).toMatch(/not on the hope/i);
  });

  it('skips a bad lesson without losing the rest of the batch', async () => {
    // Katie submits a term at a time. One stale id must not cost her the
    // other thirty-nine claims.
    mocks.findLesson.mockImplementation(async (id: string) =>
      id === 'lesson-bad' ? undefined : { ...renderedLesson, id }
    );

    const result = await handler(
      {
        lessonIds: ['lesson-1', 'lesson-bad', 'lesson-2'],
        status: 'submitted',
      },
      { uid: 'admin-1' }
    );

    expect(result.recordedLessonIds).toEqual(['lesson-1', 'lesson-2']);
    expect(result.skipped).toEqual([
      { lessonId: 'lesson-bad', reason: 'Lesson not found' },
    ]);
  });

  it('keeps the originally claimed rate when marking a claim paid', async () => {
    // A rate change must not retroactively restate what EMA was actually told.
    mocks.findSubmission.mockResolvedValue({
      lessonId: 'lesson-1',
      rateCents: 3250,
      submittedAt: new Date('2026-08-05T00:00:00Z'),
      status: 'submitted',
    });

    await handler(
      { lessonIds: ['lesson-1'], status: 'paid' },
      { uid: 'admin-1' }
    );

    const [payload] = mocks.record.mock.calls[0];
    expect(payload.rateCents).toBe(3250);
    expect(payload.status).toBe('paid');
    expect(payload.paidAt).toBeInstanceOf(Date);
  });

  it('records why EMA rejected a claim, so a resubmission can fix it', async () => {
    await handler(
      {
        lessonIds: ['lesson-1'],
        status: 'rejected',
        rejectionReason: 'Provider not yet approved for guitar',
      },
      { uid: 'admin-1' }
    );

    const [payload] = mocks.record.mock.calls[0];
    expect(payload.status).toBe('rejected');
    expect(payload.rejectionReason).toBe(
      'Provider not yet approved for guitar'
    );
  });
});
