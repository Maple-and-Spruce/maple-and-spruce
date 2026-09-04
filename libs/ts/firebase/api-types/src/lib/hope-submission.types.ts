/**
 * Hope submission API contracts (#799).
 */
import type {
  HopeQueueEntry,
  HopeQueueTotals,
  HopeSubmissionStatus,
} from '@maple/ts/domain';

export interface GetHopeQueueRequest {
  /** ISO bounds on the lesson date. Omit for everything. */
  from?: string;
  to?: string;
  /** Narrow to one student. */
  studentId?: string;
}

export interface GetHopeQueueResponse {
  entries: HopeQueueEntry[];
  totals: HopeQueueTotals;
}

export interface RecordHopeSubmissionsRequest {
  /** The rendered Hope lessons this applies to. */
  lessonIds: string[];
  status: HopeSubmissionStatus;
  /** EMA portal reference, when there is one. */
  emaReference?: string;
  /** Required in practice for `rejected`, so a resubmission can fix the cause. */
  rejectionReason?: string;
}

export interface RecordHopeSubmissionsResponse {
  /** Lessons whose claim was recorded. */
  recordedLessonIds: string[];
  /**
   * Lessons that were refused, with why. A lesson that is not a rendered Hope
   * lesson is skipped rather than failing the whole batch.
   */
  skipped: Array<{ lessonId: string; reason: string }>;
}
