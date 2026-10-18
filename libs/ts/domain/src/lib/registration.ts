/**
 * Registration domain types
 *
 * Represents a customer's registration for a class.
 * Full implementation in Phase 3c - this is a placeholder for type definitions.
 *
 * Future payments will use Square (consistent with existing POS integration).
 */

/**
 * Registration lifecycle status
 */
export type RegistrationStatus =
  | 'pending' // Payment initiated but not confirmed
  | 'confirmed' // Payment successful, registration complete
  | 'cancelled' // Customer cancelled (may be refunded)
  | 'refunded' // Full refund issued
  | 'no-show'; // Customer didn't attend

/**
 * Channel the registration was created through.
 * Used for reporting and to gate the dedup logic in the Square POS webhook
 * (a `web` registration's Square order carries metadata so the POS handler
 * skips it).
 */
export type RegistrationSource =
  | 'web' // Customer self-registered on the public Webflow site
  | 'pos'; // Staff rang up the class on Square POS in person

/**
 * Additional person included on a registration beyond the registrant.
 * Both fields are optional — the registrant may add a row to reserve a
 * spot for a friend without supplying their info.
 */
export interface Attendee {
  name?: string;
  email?: string;
}

/**
 * Registration entity - customer signed up for a class
 */
export interface Registration {
  id: string;
  /** Class being registered for */
  classId: string;
  /** Customer email (primary identifier) */
  customerEmail: string;
  /** Customer name */
  customerName: string;
  /** Customer phone (optional) */
  customerPhone?: string;
  /**
   * Number of spots. Server derives this from `1 + additionalAttendees.length`
   * so capacity rollups, pricing, and admin views keep working unchanged.
   */
  quantity: number;
  /**
   * Extra people beyond the registrant. Empty/absent = solo registration.
   * Attendees with an `email` receive a class-details-only confirmation.
   */
  additionalAttendees?: Attendee[];
  /** Total amount paid in cents (includes tax) */
  pricePaidCents: number;
  /** Post-discount, pre-tax amount in cents */
  subtotalCents: number;
  /** Sales tax amount in cents */
  taxAmountCents: number;
  /** Tax rate applied as percentage (e.g., 6.0 for 6%) */
  taxRatePercent: number;
  /** Square payment ID (for refunds, reconciliation) */
  squarePaymentId?: string;
  /** Square order ID */
  squareOrderId?: string;
  /** Square receipt URL (for customer payment receipt) */
  squareReceiptUrl?: string;
  /** Discount/coupon code applied */
  discountCode?: string;
  /** Discount amount in cents */
  discountAmountCents?: number;
  /** Registration status */
  status: RegistrationStatus;
  /**
   * When the registration became fully refunded, through the app or in the
   * Square dashboard. Unset while only part of the payment has been refunded:
   * instructor payouts read a set `refundedAt` as "this seat was refunded".
   */
  refundedAt?: Date;
  /**
   * Total refunded so far in cents (tax-inclusive, as charged). Cumulative
   * across refunds, so a partial refund leaves it below `pricePaidCents`.
   */
  refundedAmountCents?: number;
  /** Square refund ID of the refund that completed it, for reconciliation. */
  squareRefundId?: string;
  /**
   * Every Square refund already counted into `refundedAmountCents`. The Square
   * webhook checks it so a redelivered event, or the echo of a refund the app
   * made itself, is not counted twice.
   */
  squareRefundIds?: string[];
  /** When the most recent refund (full or partial) was recorded. */
  lastRefundAt?: Date;
  /**
   * A Square refund that could not be pinned on this registration: it was
   * made against a payment this registration shares (a POS sale with other
   * classes or shop items on it), and Square does not say which items were
   * refunded. Nothing about the registration changes until someone decides;
   * it shows on the Home Inbox as `refund-review`. Cleared when the
   * registration is cancelled as already refunded in Square.
   */
  refundReviewAt?: Date;
  /** The amount of that refund, in cents (tax-inclusive). */
  refundReviewAmountCents?: number;
  /** The Square id of that refund. */
  refundReviewId?: string;
  /** Human-readable confirmation number (e.g. MS-XXXXXX) shown to the buyer. */
  confirmationNumber?: string;
  /**
   * Channel the registration came from. Defaults to `'web'` for any record
   * predating the field — see `docToRegistration` for the back-compat read.
   */
  source: RegistrationSource;
  /** Notes from customer (e.g., dietary restrictions, accessibility needs) */
  notes?: string;
  /** Confirmation email sent */
  confirmationSentAt?: Date;
  /**
   * Most recent day-of class reminder email sent for this registration.
   * Used as the simple "any reminder ever sent?" sentinel.
   */
  reminderSentAt?: Date;
  /**
   * Per-session reminder timestamps for multi-session classes.
   * Key: session start `dateTime` as ISO 8601 string. Value: when the
   * reminder for that session was queued.
   *
   * Only `sendClassReminders` writes to this map. It's the source of truth
   * for idempotency — a reminder is sent only when the key is missing for
   * today's session.
   */
  reminderSentForSessions?: Record<string, Date>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new registration
 */
export type CreateRegistrationInput = Omit<
  Registration,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'confirmationSentAt'
  | 'reminderSentAt'
  | 'reminderSentForSessions'
  | 'refundedAt'
  | 'refundedAmountCents'
  | 'squareRefundId'
  | 'squareRefundIds'
  | 'lastRefundAt'
  | 'refundReviewAt'
  | 'refundReviewAmountCents'
  | 'refundReviewId'
>;

/**
 * Input for updating a registration (e.g., status change, refund)
 */
export type UpdateRegistrationInput = Partial<
  Omit<Registration, 'id' | 'createdAt' | 'updatedAt' | 'classId'>
> & {
  id: string;
};

/**
 * Check if a registration is in a confirmed state (customer will attend)
 */
export function isRegistrationConfirmed(registration: Registration): boolean {
  return registration.status === 'confirmed';
}

/**
 * Check if a registration can be refunded
 */
export function canRefundRegistration(registration: Registration): boolean {
  return (
    registration.status === 'confirmed' || registration.status === 'cancelled'
  );
}

/**
 * What the student paid for the class itself: after any discount, before
 * sales tax. This is the revenue an instructor's share is taken from.
 *
 * `subtotalCents` is already post-discount, and `pricePaidCents` includes
 * tax, so neither the discount nor the tax is applied again here.
 */
export function getNetAmountPaid(registration: Registration): number {
  return registration.subtotalCents;
}

/** A completed Square refund against a registration's payment. */
export interface SquareRefundInput {
  refundId: string;
  /** Tax-inclusive, as refunded. */
  amountCents: number;
  /** When the refund was made. */
  at: Date;
}

/**
 * What a refund did to a registration:
 * - `full`: the refunds now cover what was paid, so it is `refunded`
 * - `partial`: some money went back; the student stays enrolled
 * - `duplicate`: this refund was already counted (a redelivered webhook, or
 *   the echo of a refund the app made itself), so nothing changes
 */
export type SquareRefundOutcome = 'full' | 'partial' | 'duplicate';

export type SquareRefundUpdates = Pick<
  Registration,
  'refundedAmountCents' | 'squareRefundIds' | 'lastRefundAt'
> &
  Partial<Pick<Registration, 'status' | 'refundedAt' | 'squareRefundId'>>;

/**
 * Fold one Square refund into a registration. Pure, so the Firestore
 * transaction that runs it and its spec agree on one rule.
 *
 * Refunds are cumulative: two partial refunds that add up to the price make
 * the registration refunded. A partial refund changes no status, because the
 * student keeps their seat and the instructor keeps their share until someone
 * decides otherwise (it surfaces on the Home Inbox as `refund-partial`).
 */
export function applySquareRefundToRegistration(
  registration: Pick<
    Registration,
    | 'status'
    | 'pricePaidCents'
    | 'refundedAmountCents'
    | 'refundedAt'
    | 'squareRefundId'
    | 'squareRefundIds'
  >,
  refund: SquareRefundInput
): { outcome: 'duplicate' } | {
  outcome: 'full' | 'partial';
  updates: SquareRefundUpdates;
} {
  const seen = registration.squareRefundIds ?? [];
  if (
    seen.includes(refund.refundId) ||
    registration.squareRefundId === refund.refundId
  ) {
    return { outcome: 'duplicate' };
  }

  const refundedAmountCents =
    (registration.refundedAmountCents ?? 0) + Math.max(0, refund.amountCents);
  const updates: SquareRefundUpdates = {
    refundedAmountCents,
    squareRefundIds: [...seen, refund.refundId],
    lastRefundAt: refund.at,
  };

  if (refundedAmountCents < registration.pricePaidCents) {
    return { outcome: 'partial', updates };
  }

  updates.status = 'refunded';
  if (!registration.refundedAt) updates.refundedAt = refund.at;
  if (!registration.squareRefundId) updates.squareRefundId = refund.refundId;
  return { outcome: 'full', updates };
}

/**
 * Part of the payment has gone back but the registration is still active:
 * the case someone has to look at by hand.
 */
export function hasOpenPartialRefund(
  registration: Pick<Registration, 'status' | 'refundedAmountCents'>
): boolean {
  return (
    (registration.refundedAmountCents ?? 0) > 0 &&
    registration.status !== 'refunded' &&
    registration.status !== 'cancelled'
  );
}

/**
 * Whether a Square refund can be applied to the registrations its payment
 * matched without a person deciding.
 *
 * Square's refund event carries an amount but no itemization. A web checkout
 * is one payment for one class registration, so the refund can only be for
 * that. A POS sale is not: `processPosSale` writes one registration per class
 * line, all on the sale's payment, and the same sale can include shop items.
 * A $100 refund on such a sale may be for a pot, not the class, so applying it
 * would take away a seat and the instructor's pay. Those are flagged instead.
 */
export function isSquareRefundUnambiguous(
  matches: ReadonlyArray<Pick<Registration, 'source'>>
): boolean {
  return matches.length === 1 && matches[0].source !== 'pos';
}

/**
 * Whether any of the registrations already accounts for this refund: the app
 * made it (`cancelRegistration` records its id), or an earlier delivery of the
 * same event was applied or flagged.
 */
export function isSquareRefundRecorded(
  matches: ReadonlyArray<Pick<Registration, 'squareRefundId' | 'squareRefundIds'>>,
  refundId: string
): boolean {
  return matches.some(
    (r) =>
      r.squareRefundId === refundId ||
      (r.squareRefundIds ?? []).includes(refundId)
  );
}

export type SquareRefundReviewUpdates = Required<
  Pick<
    Registration,
    | 'squareRefundIds'
    | 'lastRefundAt'
    | 'refundReviewAt'
    | 'refundReviewAmountCents'
    | 'refundReviewId'
  >
>;

/**
 * Flag a refund for review on one registration it might belong to. Status and
 * `refundedAmountCents` are left alone; only the refund is noted, and its id
 * is remembered so a redelivery is a no-op.
 */
export function flagSquareRefundForReview(
  registration: Pick<Registration, 'squareRefundId' | 'squareRefundIds'>,
  refund: SquareRefundInput
):
  | { outcome: 'duplicate' }
  | { outcome: 'flagged'; updates: SquareRefundReviewUpdates } {
  if (isSquareRefundRecorded([registration], refund.refundId)) {
    return { outcome: 'duplicate' };
  }
  return {
    outcome: 'flagged',
    updates: {
      squareRefundIds: [...(registration.squareRefundIds ?? []), refund.refundId],
      lastRefundAt: refund.at,
      refundReviewAt: refund.at,
      refundReviewAmountCents: Math.max(0, refund.amountCents),
      refundReviewId: refund.refundId,
    },
  };
}

/** A flagged refund someone still has to look at. */
export function hasOpenRefundReview(
  registration: Pick<Registration, 'status' | 'refundReviewAt'>
): boolean {
  return (
    registration.refundReviewAt !== undefined &&
    registration.status !== 'refunded' &&
    registration.status !== 'cancelled'
  );
}

/**
 * What to record as refunded when a registration is cancelled as "already
 * refunded in Square": the flagged refund's amount when there is one and it
 * fits the price, otherwise the whole price (a dashboard refund from before
 * the webhook was subscribed, which nothing recorded).
 */
export function refundedInSquareAmountCents(
  registration: Pick<Registration, 'pricePaidCents' | 'refundReviewAmountCents'>
): number {
  const flagged = registration.refundReviewAmountCents;
  return flagged !== undefined && flagged > 0 && flagged <= registration.pricePaidCents
    ? flagged
    : registration.pricePaidCents;
}
