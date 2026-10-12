/**
 * Lesson API request/response types
 *
 * Types for Firebase Cloud Function calls related to music lessons.
 * Shared between client and server for type-safe API calls.
 */
import type {
  BlockStrategy,
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

export interface CreateLessonRequest extends CreateLessonInput {
  /**
 * How to attribute this to a block when none already fits (legacy #835).
 *
 * Omit it for the pre-#835 behaviour: `blockId` must already name a block the
 * lesson fits, or the call is refused. Supply it to have a block derived from
 * what is being scheduled, or a nearby one widened.
 */
  blockStrategy?: BlockStrategy;
}

export interface CreateLessonResponse {
  lesson: Lesson;
}

// ============================================================================
// Create Lesson Series
// ============================================================================

export interface CreateLessonSeriesRequest extends CreateLessonSeriesInput {
  /**
 * How to attribute this to a block when none already fits (legacy #835).
 *
 * Omit it for the pre-#835 behaviour: `blockId` must already name a block the
 * lesson fits, or the call is refused. Supply it to have a block derived from
 * what is being scheduled, or a nearby one widened.
 */
  blockStrategy?: BlockStrategy;
}

export interface CreateLessonSeriesResponse {
  lessons: Lesson[];
  seriesId: string;
}

// ============================================================================
// Update Lesson
// ============================================================================

export interface UpdateLessonRequest extends UpdateLessonInput {
  /**
   * How to attribute this to a block when the new time fits none (legacy #835).
   * Moving a lesson out of its block is the case this exists for.
   */
  blockStrategy?: BlockStrategy;
}

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

// ============================================================================
// Reschedule Lesson With Credit (#209)
// ============================================================================

/**
 * Cancel a lesson and book its replacement, carrying the cancelled lesson's
 * payment over to the new one.
 *
 * The replacement keeps the original's student, teacher, length and room
 * unless the caller names others.
 */
export interface RescheduleLessonWithCreditRequest {
  /** The lesson being cancelled. */
  lessonId: string;
  /** When the replacement is. */
  scheduledAt: Date;
  durationMinutes?: number;
  room?: Lesson['room'];
  /** How to attribute the replacement to a block when the new time fits none. */
  blockStrategy?: BlockStrategy;
}

/**
 * What paid for the cancelled lesson, and so now pays for the replacement.
 * `none` when nothing had billed it yet: the replacement is then billed like
 * any other lesson.
 */
export type CarriedLessonCoverage = 'charge' | 'invoice' | 'none';

export interface RescheduleLessonWithCreditResponse {
  cancelled: Lesson;
  replacement: Lesson;
  coverage: CarriedLessonCoverage;
}
