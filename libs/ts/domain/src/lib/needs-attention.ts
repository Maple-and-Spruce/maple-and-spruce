/**
 * Needs Attention (#807).
 *
 * Six states already existed as data and none of them surfaced as a to-do, so
 * finding any of them meant going looking, per student. Each one is money or
 * compliance quietly going wrong:
 *
 *   - a lesson attributed to no block          → scheduling drifts out of the model
 *   - an invoice that never reached Square     → the family was never asked to pay
 *   - an invoice sent and unpaid for weeks     → nobody is chasing it
 *   - a rendered lesson with no invoice        → work done, never billed
 *   - an active student with autoInvoice off   → every future lesson bills nobody
 *   - a rendered Hope lesson never claimed     → money left with the state
 *
 * The classifiers here are pure so the rules can be tested without Firestore,
 * and so the "is this wrong?" question has exactly one definition per state
 * rather than one in a query and another in a component.
 */
import type { Invoice } from './invoice';
import type { Lesson } from './lesson';
import type { Student } from './student';
import { isLessonUnattributed } from './lesson-block';
import type { LessonBlock } from './lesson-block';
import { isSubmittableToHope } from './lesson';

export type NeedsAttentionKind =
  | 'lesson-unattributed'
  | 'invoice-sync-failed'
  | 'invoice-overdue'
  | 'lesson-unbilled'
  | 'student-autoinvoice-off'
  | 'hope-unsubmitted';

/**
 * How a row is resolved.
 *
 * `inline` means the panel itself can fix it in one action. `navigate` means
 * the row links to the exact record — not a list to search. Anything that can
 * only be described, never acted on, does not belong in this panel at all.
 */
export type NeedsAttentionResolution = 'inline' | 'navigate';

export interface NeedsAttentionRow {
  kind: NeedsAttentionKind;
  /** Stable id for the underlying record, used for keys and inline actions. */
  id: string;
  /** What is wrong, in the words someone would use out loud. */
  label: string;
  /** Supporting detail — a date, an amount, a student name. */
  detail?: string;
  /** Where the row leads when `resolution` is `navigate`. */
  href?: string;
  resolution: NeedsAttentionResolution;
  /** Amount at stake, when the row is about money. Drives ordering. */
  amountCents?: number;
  /** Which teacher's work this concerns, for self-scoping. */
  teacherId?: string;
}

export interface NeedsAttentionGroup {
  kind: NeedsAttentionKind;
  title: string;
  /** Why this matters, shown when the group is expanded. */
  because: string;
  rows: NeedsAttentionRow[];
}

/**
 * How long a sent invoice may go unpaid before it is someone's problem.
 *
 * Two weeks: long enough that a family who pays monthly is not nagged, short
 * enough that a lost invoice surfaces inside the same billing cycle.
 */
export const INVOICE_OVERDUE_DAYS = 14;

export function isInvoiceOverdue(
  invoice: Pick<Invoice, 'status' | 'issuedAt'>,
  now: Date = new Date()
): boolean {
  if (invoice.status !== 'sent' || !invoice.issuedAt) return false;
  const age = now.getTime() - invoice.issuedAt.getTime();
  return age >= INVOICE_OVERDUE_DAYS * 86_400_000;
}

export function hasInvoiceSyncFailed(
  invoice: Pick<Invoice, 'squareSyncError' | 'status'>
): boolean {
  // A voided invoice's stale error is not a task.
  return Boolean(invoice.squareSyncError) && invoice.status !== 'void';
}

/**
 * A lesson that was taught and has no invoice line anywhere.
 *
 * Deliberately checked for *every* private-pay student, not only those flagged
 * `autoInvoice`: the trigger silently skips when no rate resolves, and that
 * skip is exactly the case worth surfacing. Hope lessons are excluded — they
 * bill through EMA and have their own row.
 */
export function isLessonUnbilled(
  lesson: Pick<Lesson, 'id' | 'status'>,
  student: Pick<Student, 'isHopeScholarship'>,
  invoicedLessonIds: Set<string>
): boolean {
  if (student.isHopeScholarship) return false;
  if (lesson.status !== 'rendered' && lesson.status !== 'no-show') return false;
  return !invoicedLessonIds.has(lesson.id);
}

/**
 * An active student whose lessons will never bill automatically.
 *
 * Hope students are excluded: `autoInvoice` is meaningless for them, since
 * `createInvoice` refuses Hope students outright.
 */
export function needsAutoInvoiceEnabled(
  student: Pick<Student, 'status' | 'isHopeScholarship' | 'autoInvoice'>
): boolean {
  return (
    student.status === 'active' &&
    !student.isHopeScholarship &&
    !student.autoInvoice
  );
}

/** A rendered Hope lesson with no claim, or one EMA rejected. */
export function isHopeUnsubmitted(
  lesson: Pick<Lesson, 'status'>,
  submissionStatus: 'submitted' | 'paid' | 'rejected' | undefined
): boolean {
  if (!isSubmittableToHope(lesson.status)) return false;
  return submissionStatus === undefined || submissionStatus === 'rejected';
}

export { isLessonUnattributed };
export type { LessonBlock };

/**
 * Order groups by how much it costs to ignore them.
 *
 * Money that will never arrive on its own comes before money that is merely
 * late, which comes before configuration that will cause a problem later. A
 * panel sorted by count instead would put the most numerous nuisance on top.
 */
const KIND_PRIORITY: NeedsAttentionKind[] = [
  'invoice-sync-failed',
  'lesson-unbilled',
  'hope-unsubmitted',
  'invoice-overdue',
  'lesson-unattributed',
  'student-autoinvoice-off',
];

export function sortAttentionGroups(
  groups: NeedsAttentionGroup[]
): NeedsAttentionGroup[] {
  return [...groups]
    .filter((g) => g.rows.length > 0)
    .sort(
      (a, b) => KIND_PRIORITY.indexOf(a.kind) - KIND_PRIORITY.indexOf(b.kind)
    );
}

export function totalAttentionCount(groups: NeedsAttentionGroup[]): number {
  return groups.reduce((sum, g) => sum + g.rows.length, 0);
}
