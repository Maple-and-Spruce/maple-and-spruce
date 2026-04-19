/**
 * Lesson validation suite
 *
 * Vest validation for music lesson forms (single + series).
 */
import { staticSuite, test, enforce, only } from 'vest';
import type {
  CreateLessonInput,
  CreateLessonSeriesInput,
} from '@maple/ts/domain';
import { LESSON_STATUSES } from '@maple/ts/domain';

/** Allowed lesson durations in minutes. Mirrors LessonLength tiers on Student. */
const ALLOWED_DURATIONS = [30, 45, 60] as const;

export const lessonValidation = staticSuite(
  (data: Partial<CreateLessonInput>, field?: string | string[]) => {
    only(field);

    test('studentId', 'Student is required', () => {
      enforce(data.studentId).isNotBlank();
    });

    test('teacherId', 'Teacher is required', () => {
      enforce(data.teacherId).isNotBlank();
    });

    test('scheduledAt', 'Scheduled date/time is required', () => {
      enforce(data.scheduledAt).isNotNull();
      enforce(data.scheduledAt).isNotUndefined();
    });

    test('scheduledAt', 'Scheduled date/time must be a valid date', () => {
      if (data.scheduledAt instanceof Date) {
        enforce(Number.isFinite(data.scheduledAt.getTime())).isTruthy();
      }
    });

    test('durationMinutes', 'Duration is required', () => {
      enforce(data.durationMinutes).isNotNull();
      enforce(data.durationMinutes).isNotUndefined();
    });

    test('durationMinutes', 'Duration must be 30, 45, or 60 minutes', () => {
      if (
        data.durationMinutes !== undefined &&
        data.durationMinutes !== null
      ) {
        enforce(data.durationMinutes).inside(
          ALLOWED_DURATIONS as readonly number[]
        );
      }
    });

    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be scheduled, rendered, or cancelled', () => {
      if (data.status) {
        enforce(data.status).inside(LESSON_STATUSES);
      }
    });

    test('notes', 'Notes must be less than 2000 characters', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(2000);
      }
    });
  }
);

export const lessonSeriesValidation = staticSuite(
  (data: Partial<CreateLessonSeriesInput>, field?: string | string[]) => {
    only(field);

    test('studentId', 'Student is required', () => {
      enforce(data.studentId).isNotBlank();
    });

    test('teacherId', 'Teacher is required', () => {
      enforce(data.teacherId).isNotBlank();
    });

    test('durationMinutes', 'Duration is required', () => {
      enforce(data.durationMinutes).isNotNull();
      enforce(data.durationMinutes).isNotUndefined();
    });

    test('durationMinutes', 'Duration must be 30, 45, or 60 minutes', () => {
      if (
        data.durationMinutes !== undefined &&
        data.durationMinutes !== null
      ) {
        enforce(data.durationMinutes).inside(
          ALLOWED_DURATIONS as readonly number[]
        );
      }
    });

    test('scheduledAts', 'At least one scheduled date is required', () => {
      enforce(data.scheduledAts).isArray();
      enforce(data.scheduledAts?.length ?? 0).greaterThan(0);
    });

    test(
      'scheduledAts',
      'All scheduled dates must be valid Date values',
      () => {
        if (Array.isArray(data.scheduledAts)) {
          for (const d of data.scheduledAts) {
            enforce(d instanceof Date).isTruthy();
            if (d instanceof Date) {
              enforce(Number.isFinite(d.getTime())).isTruthy();
            }
          }
        }
      }
    );

    test('notes', 'Notes must be less than 2000 characters', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(2000);
      }
    });
  }
);
