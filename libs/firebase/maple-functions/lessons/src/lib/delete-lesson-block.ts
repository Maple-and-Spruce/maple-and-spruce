/**
 * Delete Lesson Block Cloud Function (legacy #686)
 *
 * Admin-only. Deleting a block does not touch its lessons — any lessons that
 * referenced it become "unattributed" and are flagged for an admin to
 * reattribute (the same grandfathering path as pre-block lessons).
 */
import { throwInvalidArgument, throwNotFound } from '@maple/firebase/functions';
import { LessonBlockRepository } from '@maple/firebase/database';
import type {
  DeleteLessonBlockRequest,
  DeleteLessonBlockResponse,
} from '@maple/ts/firebase/api-types';

export async function deleteLessonBlock(
  data: DeleteLessonBlockRequest,
): Promise<DeleteLessonBlockResponse> {
  if (!data.id) throwInvalidArgument('Block ID is required');

  const existing = await LessonBlockRepository.findById(data.id);
  if (!existing) throwNotFound('LessonBlock', data.id);

  await LessonBlockRepository.delete(data.id);
  return { success: true };
}
