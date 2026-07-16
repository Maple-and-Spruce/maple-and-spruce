/**
 * Music Together registration domain types
 *
 * One document per family enrolled in a Music Together section. Unlike class
 * `Registration` (email-keyed, single attendee row), MT registrations are
 * family-shaped: one or more parents and one or more children with DOBs (the
 * licensee report needs parent name, child name, child DOB per section).
 *
 * Payments route to MT's separate Square account. On the installments plan the
 * first installment is charged at registration and a card is vaulted; the
 * remaining installments are materialized as `MusicTogetherScheduledCharge`
 * documents that the auto-charge job processes on their due dates (see
 * `docs/reference/music-together-plan.md`).
 */

/** How the family chose to pay. */
export type MusicTogetherPaymentPlan =
  | 'full' // One charge of priceFullCents
  | 'installments'; // installmentCount charges; card on file for the rest

/** Registration lifecycle status. */
export type MusicTogetherRegistrationStatus =
  | 'pending' // Reserved in a transaction; payment not yet confirmed
  | 'confirmed' // Payment succeeded; family is enrolled
  | 'cancelled' // Cancelled (may be partially refunded)
  | 'refunded'; // Refund issued

/** Maximum number of children (siblings) per enrolled family. */
export const MT_MAX_CHILDREN = 3;

/** An enrolled child. Internal use only — never shared outside Maple & Spruce. */
export interface MusicTogetherChild {
  /** Child's first name. */
  name: string;
  /** Date of birth. */
  dob: Date;
}

/**
 * Music Together registration entity — one enrolled family.
 */
export interface MusicTogetherRegistration {
  id: string;
  sectionId: string;
  /** Enrolling adult's first name (shared with Music Together Worldwide). */
  adultFirstName: string;
  /** Enrolling adult's last name (shared with Music Together Worldwide). */
  adultLastName: string;
  /**
   * Parent/guardian name(s). At least one. Retained for the roster/licensee
   * views; populated from the enrolling adult's first + last name.
   */
  parentNames: string[];
  /** Enrolled children (first name + DOB). At least one, at most {@link MT_MAX_CHILDREN}. */
  children: MusicTogetherChild[];
  email: string;
  phone: string;
  /** Full mailing/street address (shared with Music Together Worldwide). */
  address: string;
  /** Special needs, allergies, or other accommodation notes. Internal use only. */
  accommodations?: string;
  paymentPlan: MusicTogetherPaymentPlan;
  /** When the family accepted the program policies. */
  policiesAcceptedAt: Date;
  /**
   * When the family accepted the privacy notice authorizing their adult
   * contact details to be shared with Music Together Worldwide. Optional only
   * for backward compatibility with pre-launch test registrations; always set
   * on registrations created through the current form.
   */
  privacyConsentAcceptedAt?: Date;
  /**
   * When the family authorized storing a card for the second charge. Set only
   * on the installments plan.
   */
  cardOnFileAuthAt?: Date;
  /** Amount charged at registration (full price, or installment 1). In cents. */
  pricePaidCents: number;
  /** Square customer ID (created/reused at registration). */
  squareCustomerId?: string;
  /** Square card-on-file ID used by the second installment. */
  squareCardId?: string;
  /** Square payment ID for the registration-time charge. */
  squarePaymentId?: string;
  /** Square order ID for the registration-time charge. */
  squareOrderId?: string;
  /** Square receipt URL for the registration-time charge. */
  squareReceiptUrl?: string;
  /**
   * Number of scheduled card-on-file charges created for this registration
   * (the installments after the first). 0 for pay-in-full. The charges
   * themselves live in `musicTogetherScheduledCharges`, keyed by
   * `registrationId`; this is a denormalized convenience count for admin views.
   */
  scheduledChargeCount?: number;
  status: MusicTogetherRegistrationStatus;
  notes?: string;
  confirmationSentAt?: Date;
  /**
   * Unguessable per-family capability token for the auto-updating calendar
   * subscription feed (`/calendar/family/<token>.ics`). Generated on the
   * family's first registration and reused (by email) across their later
   * registrations, so a single subscribe link tracks all their sections.
   * Optional for backward compatibility with pre-feature registrations.
   */
  calendarToken?: string;
  /**
   * Per-session reminder bookkeeping. Keys are a session's ISO `dateTime`;
   * presence means a day-of reminder email was already queued for that
   * session, making `sendMusicTogetherReminders` idempotent across reruns.
   */
  reminderSentForSessions?: Record<string, Date>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a registration. The server stamps `id`, `createdAt`,
 * `updatedAt`, and `confirmationSentAt`.
 */
export type CreateMusicTogetherRegistrationInput = Omit<
  MusicTogetherRegistration,
  'id' | 'createdAt' | 'updatedAt' | 'confirmationSentAt'
>;

/**
 * Input for updating a registration. `sectionId` is immutable.
 */
export type UpdateMusicTogetherRegistrationInput = Partial<
  Omit<MusicTogetherRegistration, 'id' | 'createdAt' | 'updatedAt' | 'sectionId'>
> & {
  id: string;
};

/** Whether the family is enrolled (will attend). */
export function isMtRegistrationConfirmed(
  registration: Pick<MusicTogetherRegistration, 'status'>
): boolean {
  return registration.status === 'confirmed';
}

/** Statuses that count toward a section's family capacity. */
export const MT_CAPACITY_STATUSES: readonly MusicTogetherRegistrationStatus[] = [
  'pending',
  'confirmed',
];

/** Whether this registration has scheduled card-on-file charges outstanding. */
export function mtRegistrationHasScheduledCharges(
  registration: Pick<MusicTogetherRegistration, 'scheduledChargeCount'>
): boolean {
  return (registration.scheduledChargeCount ?? 0) > 0;
}

/** Non-refundable cancellation fee withheld on a pre-class cancellation, in cents ($25.00). */
export const MT_CANCELLATION_FEE_CENTS = 2500;

/**
 * Refund owed when a registration is cancelled:
 *   - BEFORE the first class → the amount paid at registration minus the $25
 *     fee (never below 0).
 *   - ON or AFTER the first class → nothing (non-refundable).
 *
 * `firstClassAt` is the section's earliest session. When it is undefined (a
 * section with no sessions yet) the booking is treated as pre-class.
 *
 * Note: this is based on the registration-time charge (`pricePaidCents`). The
 * second installment is due in week 5 — well after the first class — so a
 * pre-class cancellation never has a second charge to refund; that charge is
 * instead cancelled so it never runs.
 */
export function mtRefundCents(
  pricePaidCents: number,
  firstClassAt: Date | undefined,
  now: Date
): number {
  if (firstClassAt && now.getTime() >= firstClassAt.getTime()) {
    return 0;
  }
  return Math.max(0, pricePaidCents - MT_CANCELLATION_FEE_CENTS);
}

/**
 * One captured Square payment that a refund can draw against — the
 * registration-time charge, or a paid installment. `amountCents` is the amount
 * captured on that payment (the ceiling for refunding it).
 */
export interface MtCapturedPayment {
  squarePaymentId: string;
  amountCents: number;
}

/** Sum of a set of captured payments — the maximum a refund may total. */
export function mtTotalCapturedCents(payments: MtCapturedPayment[]): number {
  return payments.reduce((sum, p) => sum + Math.max(0, p.amountCents), 0);
}

/** One payment's share of a refund (only payments with a non-zero share). */
export interface MtRefundAllocation {
  squarePaymentId: string;
  amountCents: number;
}

/**
 * Split a requested refund across captured payments, greedily and in order:
 * drain the first payment up to its captured amount, then the next, until the
 * requested amount is satisfied. Square refunds are per-payment, so an
 * arbitrary partial refund on an installment registration may span more than
 * one payment (registration charge + a paid installment).
 *
 * `amountCents` is clamped to the total captured, so the returned allocations
 * always sum to `min(amountCents, totalCaptured)`. Payments that receive
 * nothing are omitted. A non-positive request yields no allocations.
 */
export function mtAllocateRefund(
  payments: MtCapturedPayment[],
  amountCents: number
): MtRefundAllocation[] {
  let remaining = Math.min(
    Math.max(0, Math.floor(amountCents)),
    mtTotalCapturedCents(payments)
  );
  const allocations: MtRefundAllocation[] = [];
  for (const payment of payments) {
    if (remaining <= 0) break;
    const capacity = Math.max(0, payment.amountCents);
    if (capacity <= 0) continue;
    const take = Math.min(capacity, remaining);
    allocations.push({
      squarePaymentId: payment.squarePaymentId,
      amountCents: take,
    });
    remaining -= take;
  }
  return allocations;
}
