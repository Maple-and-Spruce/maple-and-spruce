/**
 * One list of money for one student: invoices and card charges together.
 *
 * A lesson gets paid for one of three ways, and until now the student page
 * showed them in two unrelated places:
 *
 *   - an **invoice** — the per-lesson auto-invoice, or one Katie builds by hand
 *   - an **automatic charge** — planned by a billing rule, taken by the daily job
 *   - a **manual charge** — taken on the spot, usually a family paying ahead
 *     for a block (legacy #864)
 *
 * Reading "is this family paid up?" meant holding one list in your head while
 * scanning the other. This merges them into rows a single table can show,
 * without touching either record: invoices stay invoices and charges stay
 * charges (epic #51 decided lesson money has one ledger, not a third view
 * that stores anything).
 *
 * Pure, so the table's filtering and the tests agree by construction.
 */
import type { Invoice } from './invoice';
import type { Lesson } from './lesson';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';
import { MANUAL_CHARGE_RULE_ID } from './lesson-scheduled-charge';

export type BillingRecordKind = 'invoice' | 'automatic-charge' | 'manual-charge';

export type BillingRecord =
  | {
      kind: 'invoice';
      id: string;
      /** The date the record is about, and what the table sorts on. */
      date: Date;
      amountCents: number;
      lessonIds: string[];
      isSettled: boolean;
      invoice: Invoice;
    }
  | {
      kind: 'automatic-charge' | 'manual-charge';
      id: string;
      date: Date;
      amountCents: number;
      lessonIds: string[];
      isSettled: boolean;
      charge: LessonScheduledCharge;
    };

/**
 * Was this charge taken by a person rather than planned by a rule (legacy #864)?
 *
 * Checks `source` and the `ruleId` sentinel both. A manual charge carries both
 * today, but `ruleId` is the field every charge is guaranteed to have, so a
 * record written without `source` still reads correctly.
 */
export function isManualCharge(
  charge: Pick<LessonScheduledCharge, 'ruleId' | 'source'>
): boolean {
  return (
    charge.source === 'manual' || charge.ruleId === MANUAL_CHARGE_RULE_ID
  );
}

/**
 * Nothing left to do about it. `failed` is deliberately NOT settled: it is
 * money earned and not collected, and nothing retries it on its own.
 */
export function isChargeSettled(
  charge: Pick<LessonScheduledCharge, 'status'>
): boolean {
  return (
    charge.status === 'paid' ||
    charge.status === 'cancelled' ||
    charge.status === 'waived'
  );
}

/** Paid or voided. A draft or a sent invoice still wants something. */
export function isInvoiceSettled(invoice: Pick<Invoice, 'status'>): boolean {
  return invoice.status === 'paid' || invoice.status === 'void';
}

/**
 * The date an invoice is about: when it went out, or when it was drafted.
 *
 * Not `paidAt` — sorting on that would move a row the moment it is paid, and
 * the table is read in the order bills went out.
 */
export function invoiceDate(
  invoice: Pick<Invoice, 'issuedAt' | 'createdAt'>
): Date {
  return invoice.issuedAt ?? invoice.createdAt;
}

/** Merge invoices and charges into one list, oldest first. */
export function buildBillingRecords(
  invoices: Invoice[],
  charges: LessonScheduledCharge[]
): BillingRecord[] {
  const records: BillingRecord[] = [
    ...invoices.map(
      (invoice): BillingRecord => ({
        kind: 'invoice',
        id: invoice.id,
        date: invoiceDate(invoice),
        amountCents: invoice.totalCents,
        lessonIds: invoice.lineItems
          .map((line) => line.lessonId)
          .filter((id): id is string => Boolean(id)),
        isSettled: isInvoiceSettled(invoice),
        invoice,
      })
    ),
    ...charges.map(
      (charge): BillingRecord => ({
        kind: isManualCharge(charge) ? 'manual-charge' : 'automatic-charge',
        id: charge.id,
        date: charge.dueAt,
        amountCents: charge.amountCents,
        lessonIds: charge.lessonIds,
        isSettled: isChargeSettled(charge),
        charge,
      })
    ),
  ];
  return records.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Label for the Type column. */
export const BILLING_RECORD_KIND_LABELS: Record<BillingRecordKind, string> = {
  invoice: 'Invoice',
  'automatic-charge': 'Automatic charge',
  'manual-charge': 'Manual charge',
};

/**
 * Should a lesson show while past lessons are hidden?
 *
 * Upcoming lessons always show. So does a past lesson still `scheduled`: it is
 * waiting for someone to say whether it was taught or nobody came, and hiding
 * it would hide the studio's most common action behind a switch.
 */
export function isLessonShownByDefault(
  lesson: Pick<Lesson, 'scheduledAt' | 'status'>,
  now: Date = new Date()
): boolean {
  return (
    lesson.scheduledAt.getTime() > now.getTime() ||
    lesson.status === 'scheduled'
  );
}
