/**
 * Sale domain types
 *
 * Represents a completed sale of a product.
 * Tracks commission split between store and artist.
 */

export interface Sale {
  id: string;
  productId: string;
  artistId: string;
  /** The price the item sold for */
  salePrice: number;
  /** Amount kept by the store (salePrice × commissionRate) */
  commission: number;
  /** Amount owed to the artist (salePrice - commission) */
  artistEarnings: number;
  source: SaleSource;
  etsyOrderId?: string;
  etsyReceiptId?: string;
  /** When the sale occurred */
  soldAt: Date;
  /** When the record was created */
  createdAt: Date;
  /** Payout ID if this sale has been included in a payout */
  payoutId?: string;
}

export type SaleSource = 'etsy' | 'in_store' | 'website';

/**
 * Input for recording a new sale
 */
export type CreateSaleInput = Omit<Sale, 'id' | 'createdAt' | 'payoutId'>;

/**
 * Calculate commission and artist earnings from sale price and rate
 */
export function calculateSaleAmounts(
  salePrice: number,
  commissionRate: number
): { commission: number; artistEarnings: number } {
  const commission = Math.round(salePrice * commissionRate * 100) / 100;
  const artistEarnings = Math.round((salePrice - commission) * 100) / 100;
  return { commission, artistEarnings };
}
