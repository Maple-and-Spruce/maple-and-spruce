/**
 * Lesson block validation suite (#686)
 *
 * Vest validation for the LessonBlock weekly-constraint entity. Shape-only —
 * "the lesson fits the block" and "the block belongs to this teacher" are
 * server-side cross-entity checks enforced in the lesson mutation functions.
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import { MINUTES_PER_DAY } from '@maple/ts/domain';
import type { CreateLessonBlockInput } from '@maple/ts/domain';

export const lessonBlockValidation = staticSuite(
  (data: Partial<CreateLessonBlockInput>, field?: string | string[]) => {
    only(field);

    test('teacherId', 'Teacher is required', () => {
      enforce(data.teacherId).isNotBlank();
    });

    test('dayOfWeek', 'Day of week is required', () => {
      enforce(data.dayOfWeek).isNotUndefined();
    });

    test('dayOfWeek', 'Day of week must be 0 (Sun) – 6 (Sat)', () => {
      if (data.dayOfWeek !== undefined) {
        enforce(data.dayOfWeek).greaterThanOrEquals(0);
        enforce(data.dayOfWeek).lessThanOrEquals(6);
      }
    });

    test('startMinutes', 'Start time is required', () => {
      enforce(data.startMinutes).isNotUndefined();
    });

    test('startMinutes', 'Start time must be within the day', () => {
      if (data.startMinutes !== undefined) {
        enforce(data.startMinutes).greaterThanOrEquals(0);
        enforce(data.startMinutes).lessThan(MINUTES_PER_DAY);
      }
    });

    test('endMinutes', 'End time is required', () => {
      enforce(data.endMinutes).isNotUndefined();
    });

    test('endMinutes', 'End time must be within the day', () => {
      if (data.endMinutes !== undefined) {
        enforce(data.endMinutes).greaterThan(0);
        enforce(data.endMinutes).lessThanOrEquals(MINUTES_PER_DAY);
      }
    });

    test('endMinutes', 'End time must be after start time', () => {
      if (data.startMinutes !== undefined && data.endMinutes !== undefined) {
        enforce(data.endMinutes).greaterThan(data.startMinutes);
      }
    });

    test('label', 'Label must be less than 100 characters', () => {
      if (data.label) {
        enforce(data.label).shorterThanOrEquals(100);
      }
    });
  }
);
