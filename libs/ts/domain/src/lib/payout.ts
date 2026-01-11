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
  /** Sum of all sale prices in this payout */
  totalSales: number;
  /** Sum of all commissions (store's cut) */
  totalCommission: number;
  /** Amount owed to the artist */
  amountOwed: number;
  /** Number of items sold */
  itemCount: number;
  status: PayoutStatus;
  /** When the payout was marked as paid */
  paidAt?: Date;
  notes?: string;
  /** IDs of sales included in this payout */
  saleIds: string[];
  createdAt: Date;
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
 * Summary of a payout for display
 */
export interface PayoutSummary {
  id: string;
  artistId: string;
  artistName: string;
  periodStart: Date;
  periodEnd: Date;
  itemCount: number;
  totalSales: number;
  totalCommission: number;
  amountOwed: number;
  status: PayoutStatus;
}
