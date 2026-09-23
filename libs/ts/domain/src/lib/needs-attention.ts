/**
 * Needs Attention (legacy #807).
 *
 * Six states already existed as data and none of them surfaced as a to-do, so
 * finding any of them meant going looking, per student. Each one is money or
 * compliance quietly going wrong:
 *
 *   - a lesson attributed to no block          → scheduling drifts out of the model
 *   - an invoice that never reached Square     → the family was never asked to pay
 *   - an invoice sent and unpaid for weeks     → nobody is chasing it
 *   - a rendered lesson with no invoice        → work done, never billed
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
  | 'hope-unsubmitted';

/**
 * How a row is resolved.
 *
 * Every row links to the exact record — not a list to search. Anything that can
 * only be described, never acted on, does not belong in this panel at all.
 *
 * There used to be an `inline` kind too, for the one fix the panel could make
 * itself: turning a student's automatic invoicing back on. Invoicing is
 * explicit now, so that row and the machinery behind it are gone. Bring the
 * concept back when a fix genuinely is one click.
 */
export type NeedsAttentionResolution = 'navigate';

export interface NeedsAttentionRow {
  kind: NeedsAttentionKind;
  /** Stable id for the underlying record, used for keys. */
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
 * Since invoicing became explicit, this is the row that carries the work:
 * nothing bills on its own any more, so a taught lesson with no invoice and no
 * charge is money the studio has not asked for yet. Hope lessons are excluded —
 * they bill through EMA and have their own row.
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
