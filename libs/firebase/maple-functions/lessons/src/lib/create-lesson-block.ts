/**
 * Create Lesson Block Cloud Function (legacy #686)
 *
 * Admin-only. Creates a weekly LessonBlock attributed to a teacher — the
 * constraint window that teacher's lessons must fall inside. Lesson-teachers
 * cannot create blocks (only Katie/owner shapes the schedule).
 */
import { LessonBlockRepository } from '@maple/firebase/database';
import type {
  CreateLessonBlockRequest,
  CreateLessonBlockResponse,
} from '@maple/ts/firebase/api-types';

export async function createLessonBlock(
  data: CreateLessonBlockRequest,
): Promise<CreateLessonBlockResponse> {
  const block = await LessonBlockRepository.create(data);
  return { block };
}
