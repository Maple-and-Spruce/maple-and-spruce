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
import { lessonLineDay } from './lesson-invoice';
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

/**
 * The state in a few words, for a list where a lesson has to be recognisably
 * spoken-for at a glance (#110).
 *
 * `null` for `unbilled`, because "nothing has billed it" is the default a
 * picker is offering to change — labelling every choosable row with an absence
 * only makes the billed ones harder to spot.
 */
export function describeLessonBillingState(
  state: LessonBillingState
): string | null {
  switch (state.kind) {
    case 'charge-paid':
      return `Paid ${lessonLineDay(state.on)}`;
    case 'charge-pending':
      // "On a charge" rather than "Charge due", because this state also covers a
      // charge that is in flight and one that has **failed**, and neither is
      // honestly described by a due date alone.
      return `On a charge due ${lessonLineDay(state.dueAt)}`;
    case 'charge-written-off':
      return 'Not charged for';
    case 'invoiced':
      return state.status === 'paid'
        ? 'Paid by invoice'
        : `On an invoice (${state.status})`;
    case 'unbilled':
      return null;
  }
}

/**
 * Could the studio still ask for money for this lesson, without asking twice?
 *
 * `unbilled` obviously. And **`charge-written-off` too**, which is the part worth
 * explaining: nothing is going to collect on a waived or cancelled charge, so a
 * fresh ask is not a double-collect — it is a decision, and the caller is
 * expected to show `describeLessonBillingState` beside it so the decision is
 * made knowingly rather than by accident.
 *
 * Blocking it instead produced a dead end. The way out of a **failed** charge is
 * to waive or cancel it (#102), which lands in `charge-written-off` — so if that
 * state blocked billing, a declined card would mean the lesson could never be
 * invoiced either, and the money was simply lost. A comped block is protected by
 * the label, not by making the screen refuse.
 *
 * What it does refuse is anything that would take the money twice: a `paid`
 * charge, one still coming, or a live invoice.
 */
export function canStillBillLesson(state: LessonBillingState): boolean {
  return state.kind === 'unbilled' || state.kind === 'charge-written-off';
}
