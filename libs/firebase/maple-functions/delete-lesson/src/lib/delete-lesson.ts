/**
 * Delete Lesson Cloud Function
 *
 * Admin + lesson-teacher (own lessons only; scoped-roles epic #617). UI
 * prefers cancel (updateLesson with status='cancelled') to preserve history;
 * use delete sparingly.
 */
import {
  createRoleFunction,
  Role,
  assertCanManageLesson,
  throwNotFound,
} from '@maple/firebase/functions';
import { LessonRepository } from '@maple/firebase/database';
import type {
  DeleteLessonRequest,
  DeleteLessonResponse,
} from '@maple/ts/firebase/api-types';

export const deleteLesson = createRoleFunction<
  DeleteLessonRequest,
  DeleteLessonResponse
>(async (data, context) => {
  const existing = await LessonRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Lesson', data.id);
  }

  await assertCanManageLesson(context, existing.teacherId);

  await LessonRepository.delete(data.id);

  return { success: true };
}, [Role.Admin, Role.LessonTeacher]);
