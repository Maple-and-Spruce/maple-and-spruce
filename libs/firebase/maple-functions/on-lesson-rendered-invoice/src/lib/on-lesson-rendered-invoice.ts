/**
 * onLessonRenderedInvoice Firestore Trigger (#629)
 *
 * When a lesson transitions to `rendered` **or `no-show`**, auto-create + send
 * a private-pay invoice for students flagged `autoInvoice` — so the teacher's
 * single tap is the whole billing action.
 *
 * WHY A NO-SHOW BILLS (#796)
 * --------------------------
 * Studio policy: the slot was held and the teacher was there, so a private-pay
 * family is charged exactly as if the lesson had happened. **Hope Scholarship
 * students are the opposite** — Hope pays only for services rendered and the
 * family does not owe it privately either, so nobody is charged and the studio
 * absorbs it. That falls out of the existing Hope guard below rather than
 * needing its own branch, which is deliberate: one guard, not two that can
 * drift apart.
 *
 * The invoice line for a no-show **says it was a missed lesson**. Billing a
 * family for "30-min lesson on Sept 9" when nobody attended invites a dispute
 * they would be right to raise.
 *
 * Fires only on the edge INTO a billable status, and is a sibling to
 * `onLessonWrite` rather than an extension of it — that trigger is a
 * single-purpose calendar mirror with no invoice deps, and this one needs
 * invoice + student repos.
 *
 * Guards:
 *  - student must exist, be flagged `autoInvoice`, and NOT be Hope Scholarship
 *    (Hope bills externally via EMA — #282; replicated here since a trigger
 *    doesn't go through the create-invoice callable's guard).
 *  - idempotent: skip if any non-void invoice already has a line item for this
 *    lessonId (line items are inlined, so scan the student's invoices).
 *  - skip when no positive rate resolves (can't invoice without a price).
 *
 * The invoice is created with `status: 'sent'`, so the existing
 * `syncInvoiceToSquare` trigger delivers it (Square emails the parent a hosted
 * payment page); `invoice.payment_made` then settles it. No feedback loop:
 * this trigger writes only to `invoices`, a different collection.
 */
import {
  onDocumentWritten,
  type DocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import {
  InvoiceRepository,
  LessonRatesConfigRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { didConsumeSlot, resolvePrivatePayLessonRateCents } from '@maple/ts/domain';
import type { InvoiceLineItem, Lesson, LessonStatus } from '@maple/ts/domain';

function toDateLike(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate: unknown }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

function extractLesson(snapshot: DocumentSnapshot | undefined): Lesson | null {
  if (!snapshot || !snapshot.exists) return null;
  const data = snapshot.data();
  if (!data) return null;
  const scheduledAt = toDateLike(data['scheduledAt']);
  if (!scheduledAt) return null;
  return {
    id: snapshot.id,
    ...data,
    scheduledAt,
    createdAt: toDateLike(data['createdAt']) ?? new Date(),
    updatedAt: toDateLike(data['updatedAt']) ?? new Date(),
  } as Lesson;
}

function lessonInvoiceDescription(lesson: Lesson): string {
  const date = lesson.scheduledAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  // Say what the charge is for. A family billed for a "lesson" they know nobody
  // attended will dispute it, and they would be right to.
  return lesson.status === 'no-show'
    ? `Missed lesson (${lesson.durationMinutes}-min) on ${date}`
    : `${lesson.durationMinutes}-min lesson on ${date}`;
}

export const onLessonRenderedInvoice = onDocumentWritten(
  {
    document: 'lessons/{lessonId}',
    region: 'us-east4',
  },
  async (event) => {
    const lessonId = event.params.lessonId;
    const beforeStatus = event.data?.before.data()?.['status'] as
      | string
      | undefined;
    const after = extractLesson(event.data?.after);

    // Only act on the edge INTO a billable status. Guarding on the edge (not
    // just the current status) keeps this from re-firing on later edits, and
    // comparing both sides means a rendered → no-show correction does not
    // produce a second invoice for the same lesson.
    const billableBefore = didConsumeSlot(beforeStatus as LessonStatus);
    const billableAfter = after ? didConsumeSlot(after.status) : false;
    if (!after || !billableAfter || billableBefore) {
      return;
    }

    try {
      const student = await StudentRepository.findById(after.studentId);
      if (!student) {
        console.warn(
          `[auto-invoice] lesson ${lessonId}: student ${after.studentId} not found`
        );
        return;
      }

      // Only auto-invoice opted-in, non-Hope students.
      if (!student.autoInvoice || student.isHopeScholarship) {
        return;
      }

      // Idempotency: don't double-invoice a lesson. Line items are inlined, so
      // scan the student's non-void invoices for an existing lessonId line.
      const existingInvoices = await InvoiceRepository.findAll({
        studentId: after.studentId,
      });
      const alreadyInvoiced = existingInvoices.some(
        (inv) =>
          inv.status !== 'void' &&
          inv.lineItems.some((line) => line.lessonId === lessonId)
      );
      if (alreadyInvoiced) {
        console.log(
          `[auto-invoice] lesson ${lessonId}: already invoiced — skipping`
        );
        return;
      }

      const { rateByLength } = await LessonRatesConfigRepository.get();
      const rateCents = resolvePrivatePayLessonRateCents(
        after,
        student,
        rateByLength
      );
      if (!rateCents || rateCents <= 0) {
        console.warn(
          `[auto-invoice] lesson ${lessonId}: no rate configured for student ${student.id} — skipping (set default rates in Settings or a per-student rate)`
        );
        return;
      }

      const lineItem: InvoiceLineItem = {
        id: `lesson-${lessonId}`,
        description: lessonInvoiceDescription(after),
        lessonId,
        quantity: 1,
        unitAmountCents: rateCents,
        subtotalCents: rateCents,
      };

      // Idempotent create: a deterministic per-lesson invoice id + Firestore
      // create() means a concurrent double-fire of this trigger can't produce
      // two invoices (and two Square payment pages) for one lesson. The
      // findAll scan above is the cheap early-out; this closes the race window
      // where two invocations both pass that scan before either has written.
      const invoice = await InvoiceRepository.createAutoLessonInvoice(lessonId, {
        studentId: after.studentId,
        // Create as sent so syncInvoiceToSquare delivers it automatically.
        status: 'sent',
        lineItems: [lineItem],
        notes: 'Auto-invoiced when the lesson was marked rendered.',
      });

      if (!invoice) {
        console.log(
          `[auto-invoice] lesson ${lessonId}: invoice already exists (concurrent delivery) — skipping`
        );
        return;
      }

      console.log(
        `[auto-invoice] lesson ${lessonId}: created + sent invoice ${invoice.id} ` +
          `for student ${student.id} at ${rateCents} cents`
      );
    } catch (error) {
      console.error(
        `[auto-invoice] failed for lesson ${lessonId}:`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }
);
