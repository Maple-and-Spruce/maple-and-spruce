/**
 * Where a single lesson's money stands, for a glance (the Home dashboard's
 * Today card, #235).
 *
 * A lesson is paid for one of two ways: a card charge whose `lessonIds` names
 * it (#81), or an invoice line that names it (Hope, Venmo and other payments
 * taken outside card charges). Charges speak first because they are the
 * studio's normal path; an invoice is the fallback.
 *
 * Pure: the caller fetches the student's charges and invoices.
 */
import type { Invoice } from './invoice';
import {
  chargeCoversItsLessons,
  type LessonScheduledCharge,
} from './lesson-scheduled-charge';

export type LessonPaymentStateKind =
  | 'paid'
  | 'scheduled'
  | 'failed'
  | 'waived'
  | 'unbilled';

export interface LessonPaymentState {
  state: LessonPaymentStateKind;
  /** When a scheduled card charge will run. Absent for an unpaid invoice. */
  dueAt?: Date;
}

/**
 * When more than one charge names the lesson (a moved credit, a retried
 * block), the most settled answer wins: money taken beats money planned beats
 * a failure beats a waiver.
 */
const CHARGE_RANK: Record<LessonPaymentStateKind, number> = {
  paid: 0,
  scheduled: 1,
  failed: 2,
  waived: 3,
  unbilled: 4,
};

function chargeState(
  charge: Pick<LessonScheduledCharge, 'status' | 'dueAt'>,
): LessonPaymentState | undefined {
  switch (charge.status) {
    case 'paid':
      return { state: 'paid' };
    case 'failed':
      return { state: 'failed' };
    case 'waived':
      return { state: 'waived' };
    case 'scheduled':
    case 'charging':
      return { state: 'scheduled', dueAt: charge.dueAt };
    default:
      // `cancelled`: the teaching is not happening on that charge, so it says
      // nothing about whether this lesson is paid.
      return undefined;
  }
}

export function lessonPaymentState(
  lessonId: string,
  charges: ReadonlyArray<
    Pick<LessonScheduledCharge, 'status' | 'lessonIds' | 'dueAt'>
  >,
  invoices: ReadonlyArray<Pick<Invoice, 'status' | 'lineItems'>>,
): LessonPaymentState {
  let best: LessonPaymentState | undefined;
  for (const charge of charges) {
    if (!chargeCoversItsLessons(charge)) continue;
    if (!charge.lessonIds.includes(lessonId)) continue;
    const state = chargeState(charge);
    if (!state) continue;
    if (!best || CHARGE_RANK[state.state] < CHARGE_RANK[best.state]) {
      best = state;
    }
  }
  if (best) return best;

  const invoice = invoices.find(
    (inv) =>
      inv.status !== 'void' &&
      inv.lineItems.some((line) => line.lessonId === lessonId),
  );
  if (invoice) {
    return { state: invoice.status === 'paid' ? 'paid' : 'scheduled' };
  }

  return { state: 'unbilled' };
}
