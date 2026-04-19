/**
 * Delete Lesson Cloud Function
 *
 * Hard-deletes a lesson (admin only). UI prefers cancel (updateLesson with
 * status='cancelled') to preserve history; use delete sparingly.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { LessonRepository } from '@maple/firebase/database';
import type {
  DeleteLessonRequest,
  DeleteLessonResponse,
} from '@maple/ts/firebase/api-types';

export const deleteLesson = createAdminFunction<
  DeleteLessonRequest,
  DeleteLessonResponse
>(async (data) => {
  const existing = await LessonRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Lesson', data.id);
  }

  await LessonRepository.delete(data.id);

  return { success: true };
});
