import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for onLessonWrite Firestore trigger
 *
 * Verifies that lesson create/update/cancel/delete correctly reconciles the
 * single derived CalendarEvent at the deterministic ID `lesson-{lessonId}`,
 * and that derived events never leak student details to public feeds.
 */

const mocks = vi.hoisted(() => {
  return {
    upsertWithId: vi.fn(),
    delete: vi.fn(),
  };
});

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: {
    upsertWithId: mocks.upsertWithId,
    delete: mocks.delete,
  },
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

import { onLessonWrite } from './on-lesson-write';

const handler = onLessonWrite as unknown as (event: unknown) => Promise<void>;

function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>,
  id = 'lesson-abc'
) {
  return {
    exists,
    id,
    data: () => (exists ? data : undefined),
  };
}

const scheduledAt = new Date('2030-06-15T20:30:00Z');

function ts(date: Date) {
  return { toDate: () => date };
}

const scheduledLessonData = {
  studentId: 'student-1',
  scheduledAt: ts(scheduledAt),
  durationMinutes: 30,
  teacherId: 'teacher-1',
  status: 'scheduled',
  createdAt: ts(new Date('2025-01-01')),
  updatedAt: ts(new Date('2025-01-01')),
};

describe('onLessonWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsertWithId.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
  });

  it('upserts a CalendarEvent when a lesson is scheduled', async () => {
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, scheduledLessonData),
      },
    });

    expect(mocks.upsertWithId).toHaveBeenCalledOnce();
    const [id, input] = mocks.upsertWithId.mock.calls[0];
    expect(id).toBe('lesson-abc');
    expect(input.type).toBe('lesson');
    expect(input.room).toBe('spruce');
    expect(input.sourceRef).toBe('lessons/abc');
    expect(input.startDateTime).toEqual(scheduledAt);
    expect(input.endDateTime).toEqual(
      new Date(scheduledAt.getTime() + 30 * 60 * 1000)
    );
  });

  it("uses the lesson's chosen room when set (not just the Spruce fallback)", async () => {
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(false),
        // A distinct room value proves passthrough rather than the fallback.
        after: makeSnapshot(true, { ...scheduledLessonData, room: 'maple' }),
      },
    });

    const [, input] = mocks.upsertWithId.mock.calls[0];
    expect(input.room).toBe('maple');
  });

  it('keeps derived events off public feeds and free of student details', async () => {
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, scheduledLessonData),
      },
    });

    const [, input] = mocks.upsertWithId.mock.calls[0];
    expect(input.public).toBe(false);
    expect(input.title).toBe('Music Lesson');
    expect(JSON.stringify(input)).not.toContain('student-1');
  });

  it('re-upserts at the same ID when a lesson is rescheduled', async () => {
    const newTime = new Date('2030-06-16T21:00:00Z');
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(true, scheduledLessonData),
        after: makeSnapshot(true, {
          ...scheduledLessonData,
          scheduledAt: ts(newTime),
        }),
      },
    });

    expect(mocks.upsertWithId).toHaveBeenCalledOnce();
    const [id, input] = mocks.upsertWithId.mock.calls[0];
    expect(id).toBe('lesson-abc');
    expect(input.startDateTime).toEqual(newTime);
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('keeps the event when a lesson is marked rendered (it was taught)', async () => {
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(true, scheduledLessonData),
        after: makeSnapshot(true, {
          ...scheduledLessonData,
          status: 'rendered',
        }),
      },
    });

    expect(mocks.upsertWithId).toHaveBeenCalledOnce();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it('deletes the event when a lesson is cancelled', async () => {
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(true, scheduledLessonData),
        after: makeSnapshot(true, {
          ...scheduledLessonData,
          status: 'cancelled',
        }),
      },
    });

    expect(mocks.upsertWithId).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith('lesson-abc');
  });

  it('deletes the event when a lesson doc is deleted', async () => {
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(true, scheduledLessonData),
        after: makeSnapshot(false),
      },
    });

    expect(mocks.upsertWithId).not.toHaveBeenCalled();
    expect(mocks.delete).toHaveBeenCalledWith('lesson-abc');
  });

  it('handles scheduledAt as ISO string (emulator REST API format)', async () => {
    const iso = '2030-08-15T14:00:00.000Z';
    await handler({
      params: { lessonId: 'abc' },
      data: {
        before: makeSnapshot(false),
        after: makeSnapshot(true, {
          ...scheduledLessonData,
          scheduledAt: iso,
        }),
      },
    });

    expect(mocks.upsertWithId).toHaveBeenCalledOnce();
    const [, input] = mocks.upsertWithId.mock.calls[0];
    expect(input.startDateTime).toEqual(new Date(iso));
  });
});
