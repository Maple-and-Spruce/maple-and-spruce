/**
 * Payee domain types
 *
 * Shared abstraction for entities that receive payments from Maple & Spruce.
 * Implemented by Artist (consignment commission) and Instructor (class payment).
 *
 * This enables shared payment/payout infrastructure while allowing each entity
 * to have its own payment structure and relationship semantics.
 */

/**
 * Method by which payee receives payments
 */
export type PayoutMethod = 'check' | 'venmo' | 'paypal' | 'cash' | 'other';

/**
 * Status for payee entities
 */
export type PayeeStatus = 'active' | 'inactive';

/**
 * Base interface for all payable entities.
 * Artists and Instructors both implement this interface.
 */
export interface Payee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  photoUrl?: string;
  status: PayeeStatus;
  notes?: string;
  /** Preferred method for receiving payments */
  payoutMethod?: PayoutMethod;
  /** Details for payout (e.g., Venmo handle, PayPal email) */
  payoutDetails?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Helper to check if a payee is active
 */
export function isPayeeActive(payee: Payee): boolean {
  return payee.status === 'active';
}
