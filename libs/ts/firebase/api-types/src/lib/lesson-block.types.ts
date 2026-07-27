/**
 * Lesson block API request/response types (#686).
 *
 * CRUD for the weekly LessonBlock constraint windows. Create/update/delete are
 * admin-only; read is available to admins + lesson-teachers.
 */
import type {
  LessonBlock,
  CreateLessonBlockInput,
  UpdateLessonBlockInput,
} from '@maple/ts/domain';

export interface GetLessonBlocksRequest {
  /** Scope to one teacher's blocks; omit for all. */
  teacherId?: string;
}

export interface GetLessonBlocksResponse {
  blocks: LessonBlock[];
}

export interface CreateLessonBlockRequest extends CreateLessonBlockInput {}

export interface CreateLessonBlockResponse {
  block: LessonBlock;
}

export interface UpdateLessonBlockRequest extends UpdateLessonBlockInput {}

export interface UpdateLessonBlockResponse {
  block: LessonBlock;
}

export interface DeleteLessonBlockRequest {
  id: string;
}

export interface DeleteLessonBlockResponse {
  success: boolean;
}
