/**
 * Update Lesson Cloud Function
 *
 * Updates an existing lesson (admin only). Used for reschedule
 * (scheduledAt), duration change, substitute teacher, status transitions
 * (scheduled ↔ cancelled; rendered is set by #282), and notes.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { LessonRepository } from '@maple/firebase/database';
import { lessonValidation } from '@maple/ts/validation';
import type {
  UpdateLessonRequest,
  UpdateLessonResponse,
} from '@maple/ts/firebase/api-types';

export const updateLesson = createAdminFunction<
  UpdateLessonRequest,
  UpdateLessonResponse
>(async (data) => {
  const existing = await LessonRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Lesson', data.id);
  }

  // Coerce scheduledAt if caller sent a string
  const coercedUpdates = {
    ...data,
    scheduledAt:
      data.scheduledAt === undefined
        ? undefined
        : data.scheduledAt instanceof Date
          ? data.scheduledAt
          : new Date(data.scheduledAt as unknown as string),
  };

  // Merge with existing so partial updates still pass full validation
  const merged = { ...existing, ...coercedUpdates };
  const validationResult = lessonValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const lesson = await LessonRepository.update(coercedUpdates);

  return { lesson };
});
