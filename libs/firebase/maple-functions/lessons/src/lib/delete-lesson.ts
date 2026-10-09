/**
 * Delete Lesson Cloud Function
 *
 * Admin + lesson-teacher (own lessons only; scoped-roles epic #49). UI
 * prefers cancel (updateLesson with status='cancelled') to preserve history;
 * use delete sparingly.
 */
import {
  assertCanManageLesson,
  type FunctionContext,
  throwNotFound,
} from '@maple/firebase/functions';
import { LessonRepository } from '@maple/firebase/database';
import type {
  DeleteLessonRequest,
  DeleteLessonResponse,
} from '@maple/ts/firebase/api-types';

export async function deleteLesson(
  data: DeleteLessonRequest,
  context: FunctionContext,
): Promise<DeleteLessonResponse> {
  const existing = await LessonRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Lesson', data.id);
  }

  await assertCanManageLesson(context, existing.teacherId);

  await LessonRepository.delete(data.id);

  return { success: true };
}
