/**
 * Music Together section fixtures for the enrollment E2E.
 *
 * Written directly to Firestore via the emulator REST API (or the Admin SDK
 * for the dev target), so dates are real `Date` objects — the firestore-helper
 * serializes `Date` → Firestore timestamp, and the section repository parses
 * them back to `Date`. Amounts are the MT program defaults ($252 full, two
 * $132 installments) so the spec can assert concrete dollar labels the widget
 * renders, including the per-child sibling discount (2 kids → $378).
 *
 * The section is deliberately `visible: true` + `enrollmentActive: true` with
 * no scheduled open/close window, so `mtSectionEnrollmentOpen` resolves to
 * `true` and the widget shows the registration form (not the "opens soon" or
 * waitlist panels).
 */

/** A future date, `days` days from now. */
function futureDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Base tuition ($252.00). The sibling discount multiplies this: 1 child →
 * $252.00, 2 children → $378.00, 3 children → $504.00. The spec asserts the
 * 1-child and 2-child totals to lock in the backend-authoritative pricing.
 */
export const MT_SECTION_PRICE_FULL_CENTS = 25200;

/** Per-installment base amount ($132.00) for the two-installment plan. */
export const MT_SECTION_INSTALLMENT_CENTS = 13200;

/**
 * An open, enrolling Music Together section with a two-installment plan.
 * Session 1 is ~7 days out; the second installment is due at ~week 5.
 */
export const PUBLISHED_MT_SECTION = {
  name: 'E2E Spring — Tuesdays 10am',
  description: 'End-to-end test section for Music Together enrollment.',
  sessions: [{ dateTime: futureDate(7) }],
  capacityFamilies: 8,
  priceFullCents: MT_SECTION_PRICE_FULL_CENTS,
  installmentPlan: [
    { amountCents: MT_SECTION_INSTALLMENT_CENTS, dueAt: futureDate(7) },
    { amountCents: MT_SECTION_INSTALLMENT_CENTS, dueAt: futureDate(35) },
  ],
  visible: true,
  enrollmentActive: true,
  location: 'Maple & Spruce Studio',
  room: 'Main Room',
  createdAt: new Date(),
  updatedAt: new Date(),
};
