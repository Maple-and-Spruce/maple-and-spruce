/**
 * Has this lesson been billed yet, and how? (#101)
 *
 * Invoicing is explicit: nothing bills on its own any more. So the moment a
 * lesson is marked taught, the honest question is whether anyone has asked the
 * family to pay for it — by card charge or by invoice — and that has exactly
 * one answer, here, rather than one in the student page and another in the
 * teacher's view.
 */
import { invoicedLessonIds } from './invoice';
import type { Invoice } from './invoice';
import { chargeCoversItsLessons } from './lesson-scheduled-charge';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';

export type LessonBillingState =
  /** A card charge already took the money. */
  | { kind: 'charge-paid'; on: Date }
  /** A card charge is planned, in flight, or waiting on a retry. */
  | { kind: 'charge-pending'; dueAt: Date }
  /** The studio decided not to charge for it. */
  | { kind: 'charge-written-off' }
  /** A live invoice asks the family to pay. */
  | { kind: 'invoiced'; status: Invoice['status'] }
  /** Nobody has asked for the money yet. */
  | { kind: 'unbilled' };

export function lessonBillingState(
  lessonId: string,
  charges: Array<
    Pick<
      LessonScheduledCharge,
      'status' | 'lessonIds' | 'dueAt' | 'resolvedAt' | 'updatedAt'
    >
  >,
  invoices: Array<Pick<Invoice, 'status' | 'lineItems'>>
): LessonBillingState {
  // A charge outranks an invoice when both exist: the card charge is where the
  // money actually moved, and saying so is more use than naming the paperwork.
  const charge = charges.find(
    (c) => c.lessonIds.includes(lessonId) && chargeCoversItsLessons(c)
  );
  if (charge) {
    if (charge.status === 'paid') {
      return { kind: 'charge-paid', on: charge.resolvedAt ?? charge.updatedAt };
    }
    if (charge.status === 'waived' || charge.status === 'cancelled') {
      return { kind: 'charge-written-off' };
    }
    return { kind: 'charge-pending', dueAt: charge.dueAt };
  }

  if (invoicedLessonIds(invoices).has(lessonId)) {
    const invoice = invoices.find(
      (i) =>
        i.status !== 'void' &&
        i.lineItems.some((line) => line.lessonId === lessonId)
    );
    return { kind: 'invoiced', status: invoice?.status ?? 'sent' };
  }

  return { kind: 'unbilled' };
}
