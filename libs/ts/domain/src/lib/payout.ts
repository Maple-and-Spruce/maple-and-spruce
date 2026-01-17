/**
 * Payout domain types
 *
 * Represents a payment period for an artist.
 * Aggregates sales for a given period and tracks payment status.
 */

export interface Payout {
  id: string;
  artistId: string;
  /** Start of the payout period */
  periodStart: Date;
  /** End of the payout period */
  periodEnd: Date;

  /** Number of sales in this payout */
  saleCount: number;
  /** Sum of all sale prices in this payout */
  totalSales: number;
  /** Sum of all commissions (store's cut) */
  totalCommission: number;
  /** Amount owed to the artist */
  amountOwed: number;

  status: PayoutStatus;
  /** When the payout was marked as paid */
  paidAt?: Date;
  /** How the artist was paid (e.g., "check", "venmo", "cash") */
  paymentMethod?: string;
  /** Reference number or note for the payment */
  paymentReference?: string;
  notes?: string;

  /** IDs of sales included in this payout */
  saleIds: string[];

  createdAt: Date;
  updatedAt: Date;
}

export type PayoutStatus = 'pending' | 'paid';

/**
 * Input for generating a payout
 */
export interface GeneratePayoutInput {
  artistId: string;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Input for marking a payout as paid
 */
export interface MarkPayoutPaidInput {
  payoutId: string;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;
}

/**
 * Summary of a payout for display
 */
export interface PayoutSummary {
  id: string;
  artistId: string;
  artistName: string;
  periodStart: Date;
  periodEnd: Date;
  saleCount: number;
  totalSales: number;
  totalCommission: number;
  amountOwed: number;
  status: PayoutStatus;
}
