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
} from '@maple/ts/domain';

// ============================================================================
// Get Discounts (Admin)
// ============================================================================

export interface GetDiscountsRequest {
  /** Optional status filter */
  status?: DiscountStatus;
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
}

export interface LookupDiscountResponse {
  /** The discount if found and active, undefined otherwise */
  discount?: Discount;
}
