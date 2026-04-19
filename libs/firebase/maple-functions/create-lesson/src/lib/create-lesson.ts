/**
 * Create Lesson Cloud Function
 *
 * Creates a single music lesson (admin only). Used for first-lesson
 * bookings; recurring series use createLessonSeries.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { LessonRepository, StudentRepository } from '@maple/firebase/database';
import { lessonValidation } from '@maple/ts/validation';
import type {
  CreateLessonRequest,
  CreateLessonResponse,
} from '@maple/ts/firebase/api-types';

export const createLesson = createAdminFunction<
  CreateLessonRequest,
  CreateLessonResponse
>(async (data) => {
  // Dates arrive as ISO strings over the wire; coerce before validation.
  const coerced = {
    ...data,
    scheduledAt:
      data.scheduledAt instanceof Date
        ? data.scheduledAt
        : new Date(data.scheduledAt as unknown as string),
  };

  const validationResult = lessonValidation(coerced);
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

  const lesson = await LessonRepository.create(coerced);

  return { lesson };
});
