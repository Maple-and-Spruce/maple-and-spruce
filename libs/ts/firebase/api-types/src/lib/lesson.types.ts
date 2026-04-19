/**
 * Lesson API request/response types
 *
 * Types for Firebase Cloud Function calls related to music lessons.
 * Shared between client and server for type-safe API calls.
 */
import type {
  Lesson,
  CreateLessonInput,
  UpdateLessonInput,
  CreateLessonSeriesInput,
  LessonStatus,
} from '@maple/ts/domain';

// ============================================================================
// Get Lessons
// ============================================================================

export interface GetLessonsRequest {
  studentId?: string;
  teacherId?: string;
  seriesId?: string;
  status?: LessonStatus;
  /** ISO date strings (inclusive) */
  from?: string;
  to?: string;
}

export interface GetLessonsResponse {
  lessons: Lesson[];
}

// ============================================================================
// Create Lesson (single)
// ============================================================================

export interface CreateLessonRequest extends CreateLessonInput {}

export interface CreateLessonResponse {
  lesson: Lesson;
}

// ============================================================================
// Create Lesson Series
// ============================================================================

export interface CreateLessonSeriesRequest extends CreateLessonSeriesInput {}

export interface CreateLessonSeriesResponse {
  lessons: Lesson[];
  seriesId: string;
}

// ============================================================================
// Update Lesson
// ============================================================================

export interface UpdateLessonRequest extends UpdateLessonInput {}

export interface UpdateLessonResponse {
  lesson: Lesson;
}

// ============================================================================
// Delete Lesson
// ============================================================================

export interface DeleteLessonRequest {
  id: string;
}

export interface DeleteLessonResponse {
  success: boolean;
}
