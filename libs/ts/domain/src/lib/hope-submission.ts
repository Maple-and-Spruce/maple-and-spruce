/**
 * Hope Scholarship submission tracking (#799).
 *
 * WV Hope students are invoiced through the EMA portal, not through Square, so
 * `Invoice` is deliberately closed to them — `createInvoice` throws for a Hope
 * student and that guard is load-bearing. This models the other half: what has
 * actually been claimed from EMA, which until now lived only in the portal and
 * in Katie's memory. A missed submission had no unpaid state to chase, so the
 * money was simply never collected and nothing said so.
 *
 * PENDING IS THE ABSENCE OF A RECORD
 * ----------------------------------
 * There is no `pending` status. A rendered Hope lesson is awaiting submission
 * when it has no submission document, or when its document was `rejected` and
 * needs resubmitting. That means nothing has to materialise a row per lesson,
 * and a lesson can never be "lost" by failing to get one.
 *
 * The document id is the **lesson id**: one lesson, one claim, ever. A
 * rejected-then-resubmitted lesson updates the same record rather than
 * accumulating duplicates that could be claimed twice.
 *
 * SERVICES RENDERED ONLY
 * ----------------------
 * Hope pays only for services actually rendered. A `no-show` is charged to
 * nobody (#796) and must never reach a submission — enforced server-side
 * through `isSubmittableToHope`, not by a filter in a UI that could be
 * forgotten or bypassed.
 */
import type { Lesson } from './lesson';
import type { Student } from './student';

/**
 * States a claim can be in once it exists.
 *
 * `rejected` is not terminal: EMA rejecting a claim puts the lesson back in the
 * queue, because the studio still has not been paid for a lesson it taught.
 */
export type HopeSubmissionStatus = 'submitted' | 'paid' | 'rejected';

export const HOPE_SUBMISSION_STATUSES: HopeSubmissionStatus[] = [
  'submitted',
  'paid',
  'rejected',
];

export interface HopeSubmission {
  /** Equal to `lessonId`. One lesson, one claim. */
  id: string;
  lessonId: string;
  studentId: string;
  teacherId: string;
  /**
   * The lesson's date, denormalised so the queue can group and sort without
   * re-reading every lesson.
   */
  lessonDate: Date;
  status: HopeSubmissionStatus;
  /**
   * Cents claimed, stamped when the claim is recorded rather than read live.
   * A rate change must not retroactively rewrite what was already claimed.
   */
  rateCents: number;
  submittedAt: Date;
  paidAt?: Date;
  /** EMA portal reference, once Katie has one. */
  emaReference?: string;
  /** What EMA said, so a resubmission can fix the actual problem. */
  rejectionReason?: string;
  /** Firebase Auth uid of whoever recorded it (server-stamped). */
  recordedByUid?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type RecordHopeSubmissionInput = Omit<
  HopeSubmission,
  'id' | 'createdAt' | 'updatedAt'
>;

/**
 * One row of the Hope queue: the lesson, who it was for, and what has been
 * claimed for it so far.
 */
export interface HopeQueueEntry {
  lesson: Lesson;
  studentId: string;
  studentName: string;
  /** The student's registered tier, which sets the rate. */
  registeredLessonLength?: Student['registeredLessonLength'];
  /** The rate this lesson would be claimed at today, in cents. */
  rateCents: number;
  /** Absent until something has been claimed. */
  submission?: HopeSubmission;
}

/**
 * Is this lesson still owed to the studio by Hope?
 *
 * True when nothing has been claimed, or when the claim was rejected. This is
 * what "we have taught this and not been paid for it" means, and it is the
 * number Katie needs on one screen.
 */
export function isAwaitingHopeSubmission(entry: {
  submission?: Pick<HopeSubmission, 'status'>;
}): boolean {
  return !entry.submission || entry.submission.status === 'rejected';
}

/** Has EMA actually paid for this lesson? */
export function isHopePaid(entry: {
  submission?: Pick<HopeSubmission, 'status'>;
}): boolean {
  return entry.submission?.status === 'paid';
}

export interface HopeQueueTotals {
  /** Lessons taught and not yet successfully claimed. */
  awaitingCount: number;
  awaitingCents: number;
  /** Claimed, awaiting payment. */
  submittedCount: number;
  submittedCents: number;
  paidCount: number;
  paidCents: number;
  /** Claimed and refused — the subset of `awaiting` that needs a human. */
  rejectedCount: number;
}

/**
 * Totals for the queue header.
 *
 * `awaiting` deliberately includes rejected claims: a rejection means the
 * studio taught the lesson and still has not been paid, which is the same
 * financial position as never having claimed it. `rejectedCount` is reported
 * separately because those need a different action, not because they are a
 * different kind of debt.
 */
export function summarizeHopeQueue(entries: HopeQueueEntry[]): HopeQueueTotals {
  const totals: HopeQueueTotals = {
    awaitingCount: 0,
    awaitingCents: 0,
    submittedCount: 0,
    submittedCents: 0,
    paidCount: 0,
    paidCents: 0,
    rejectedCount: 0,
  };

  for (const entry of entries) {
    const status = entry.submission?.status;

    if (status === 'paid') {
      totals.paidCount++;
      totals.paidCents += entry.submission?.rateCents ?? entry.rateCents;
      continue;
    }

    if (status === 'submitted') {
      totals.submittedCount++;
      totals.submittedCents += entry.submission?.rateCents ?? entry.rateCents;
      continue;
    }

    if (status === 'rejected') totals.rejectedCount++;

    totals.awaitingCount++;
    // Claim at today's rate: a rejected claim will be resubmitted, and an
    // unclaimed one has never had a rate stamped.
    totals.awaitingCents += entry.rateCents;
  }

  return totals;
}
