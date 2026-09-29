/**
 * Hope submission API contracts (legacy #799).
 */
import type {
  HopeOrder,
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
  /**
   * The same students' EMA orders, oldest first, with how many lessons each
   * still has room for after invoiced and ready-to-invoice ones.
   */
  orders: HopeOrderWithRoom[];
}

export interface HopeOrderWithRoom extends HopeOrder {
  remaining: number;
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
