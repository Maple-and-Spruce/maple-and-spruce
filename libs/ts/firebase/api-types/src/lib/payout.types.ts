/**
 * Payout API request/response types
 *
 * Types for Firebase Cloud Function calls related to payouts.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Payout,
  PayoutSummary,
  GeneratePayoutInput,
  PayoutStatus,
} from '@maple/ts/domain';

// ============================================================================
// Get Payouts
// ============================================================================

export interface GetPayoutsRequest {
  /** Filter by artist ID */
  artistId?: string;
  /** Filter by status */
  status?: PayoutStatus;
}

export interface GetPayoutsResponse {
  payouts: PayoutSummary[];
}

// ============================================================================
// Get Payout by ID
// ============================================================================

export interface GetPayoutRequest {
  id: string;
}

export interface GetPayoutResponse {
  payout: Payout;
}

// ============================================================================
// Generate Payout
// ============================================================================

export interface GeneratePayoutRequest extends GeneratePayoutInput {}

export interface GeneratePayoutResponse {
  payout: Payout;
}

// ============================================================================
// Preview Payout
// ============================================================================

/**
 * Preview what a payout would look like without creating it.
 * Useful for showing totals before committing.
 */
export interface PreviewPayoutRequest extends GeneratePayoutInput {}

export interface PreviewPayoutResponse {
  /** Total sales amount */
  totalSales: number;
  /** Total commission (store's cut) */
  totalCommission: number;
  /** Amount owed to artist */
  amountOwed: number;
  /** Number of items */
  itemCount: number;
  /** IDs of sales that would be included */
  saleIds: string[];
}

// ============================================================================
// Mark Payout as Paid
// ============================================================================

export interface MarkPayoutPaidRequest {
  id: string;
  notes?: string;
}

export interface MarkPayoutPaidResponse {
  payout: Payout;
}

// ============================================================================
// Get Artist Payout Summary
// ============================================================================

/**
 * Get a summary of an artist's payout status.
 */
export interface GetArtistPayoutSummaryRequest {
  artistId: string;
}

export interface GetArtistPayoutSummaryResponse {
  /** Total amount currently owed (unpaid sales) */
  currentlyOwed: number;
  /** Number of unpaid sales */
  unpaidSaleCount: number;
  /** Total paid out all time */
  totalPaidOut: number;
  /** Total sales all time */
  totalSales: number;
  /** Last payout date */
  lastPayoutDate?: string;
}
