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
  /** Amount paid in cents */
  pricePaidCents: number;
  /** Square payment ID (for refunds, reconciliation) */
  squarePaymentId?: string;
  /** Square order ID */
  squareOrderId?: string;
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
  /** Reminder email sent */
  reminderSentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new registration
 */
export type CreateRegistrationInput = Omit<
  Registration,
  'id' | 'createdAt' | 'updatedAt' | 'confirmationSentAt' | 'reminderSentAt'
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
