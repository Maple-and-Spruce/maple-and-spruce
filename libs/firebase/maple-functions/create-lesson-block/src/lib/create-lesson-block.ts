/**
 * Create Lesson Block Cloud Function (#686)
 *
 * Admin-only. Creates a weekly LessonBlock attributed to a teacher — the
 * constraint window that teacher's lessons must fall inside. Lesson-teachers
 * cannot create blocks (only Katie/owner shapes the schedule).
 */
import { Functions, Role } from '@maple/firebase/functions';
import { LessonBlockRepository } from '@maple/firebase/database';
import { lessonBlockValidation } from '@maple/ts/validation';
import type {
  CreateLessonBlockRequest,
  CreateLessonBlockResponse,
} from '@maple/ts/firebase/api-types';

export const createLessonBlock = Functions.endpoint
  .requiringRole(Role.Admin)
  .validating(lessonBlockValidation)
  .handle<CreateLessonBlockRequest, CreateLessonBlockResponse>(async (data) => {
    const block = await LessonBlockRepository.create(data);
    return { block };
  });
