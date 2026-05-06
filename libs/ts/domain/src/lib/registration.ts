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
  /** Number of spots registered (usually 1, but could be group registration) */
  quantity: number;
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
 * Calculate the final amount paid after any discounts
 */
export function getNetAmountPaid(registration: Registration): number {
  return registration.pricePaidCents - (registration.discountAmountCents ?? 0);
}
