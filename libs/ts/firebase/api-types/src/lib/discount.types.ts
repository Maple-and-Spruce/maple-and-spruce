/**
 * Discount API request/response types
 *
 * Types for Firebase Cloud Function calls related to discount management.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Discount,
  CreateDiscountInput,
  UpdateDiscountInput,
  DiscountStatus,
  DiscountProgram,
} from '@maple/ts/domain';

// ============================================================================
// Get Discounts (Admin)
// ============================================================================

export interface GetDiscountsRequest {
  /** Optional status filter */
  status?: DiscountStatus;
  /**
   * Which program's codes to return. Admins may ask for either (or omit for
   * all); a non-admin caller is forced to `music-together` server-side
   * regardless of what is sent here.
   */
  program?: DiscountProgram;
}

export interface GetDiscountsResponse {
  discounts: Discount[];
}

// ============================================================================
// Create Discount (Admin)
// ============================================================================

export interface CreateDiscountRequest extends CreateDiscountInput {}

export interface CreateDiscountResponse {
  discount: Discount;
}

// ============================================================================
// Update Discount (Admin)
// ============================================================================

export interface UpdateDiscountRequest extends UpdateDiscountInput {}

export interface UpdateDiscountResponse {
  discount: Discount;
}

// ============================================================================
// Delete Discount (Admin)
// ============================================================================

export interface DeleteDiscountRequest {
  id: string;
}

export interface DeleteDiscountResponse {
  success: boolean;
}

// ============================================================================
// Lookup Discount by Code (Public - for checkout form)
// ============================================================================

export interface LookupDiscountRequest {
  /** Discount code entered by customer */
  code: string;
  /**
   * The checkout asking. A code belonging to another program resolves to
   * `undefined` — same shape as an unknown code, so a classes customer can't
   * probe for the existence of Music Together promotions. Omitted by older
   * widget bundles, which are then treated as `classes` (the only program
   * that had codes before scoping).
   */
  program?: DiscountProgram;
}

export interface LookupDiscountResponse {
  /** The discount if found and active, undefined otherwise */
  discount?: Discount;
}
