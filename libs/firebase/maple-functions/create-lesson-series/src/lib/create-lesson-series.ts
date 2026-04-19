/**
 * Create Lesson Series Cloud Function
 *
 * Atomically creates N lessons sharing a seriesId. The client sends the
 * final list of scheduled dates (having already applied any holiday skips
 * in the preview step), so the server writes them as-is.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { LessonRepository, StudentRepository } from '@maple/firebase/database';
import { lessonSeriesValidation } from '@maple/ts/validation';
import type {
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse,
} from '@maple/ts/firebase/api-types';

export const createLessonSeries = createAdminFunction<
  CreateLessonSeriesRequest,
  CreateLessonSeriesResponse
>(async (data) => {
  // Dates arrive as ISO strings over the wire; coerce each one before validation.
  const coerced = {
    ...data,
    scheduledAts: (data.scheduledAts ?? []).map((d) =>
      d instanceof Date ? d : new Date(d as unknown as string)
    ),
  };

  const validationResult = lessonSeriesValidation(coerced);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const student = await StudentRepository.findById(coerced.studentId);
  if (!student) {
    throw new Error(`Student not found: ${coerced.studentId}`);
  }

  // Snapshot primary teacher on every lesson in the series so later
  // reassignment can't retroactively flip substitute attribution (#283).
  const { lessons, seriesId } = await LessonRepository.createSeries({
    ...coerced,
    primaryTeacherAtCreateId:
      coerced.primaryTeacherAtCreateId ?? student.primaryTeacherId,
  });

  return { lessons, seriesId };
});
