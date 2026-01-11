/**
 * Sale API request/response types
 *
 * Types for Firebase Cloud Function calls related to sales.
 * These are shared between client and server for type-safe API calls.
 */
import type { Sale, CreateSaleInput, SaleSource } from '@maple/ts/domain';

// ============================================================================
// Get Sales
// ============================================================================

export interface GetSalesRequest {
  /** Filter by artist ID */
  artistId?: string;
  /** Filter by source */
  source?: SaleSource;
  /** Filter by date range start (ISO string) */
  from?: string;
  /** Filter by date range end (ISO string) */
  to?: string;
  /** Only include sales not yet in a payout */
  unpaidOnly?: boolean;
}

export interface GetSalesResponse {
  sales: Sale[];
}

// ============================================================================
// Get Sale by ID
// ============================================================================

export interface GetSaleRequest {
  id: string;
}

export interface GetSaleResponse {
  sale: Sale;
}

// ============================================================================
// Record Sale
// ============================================================================

export interface RecordSaleRequest extends CreateSaleInput {}

export interface RecordSaleResponse {
  sale: Sale;
}

// ============================================================================
// Record Sale from Product
// ============================================================================

/**
 * Record a sale for an existing product.
 * The sale price defaults to the product price but can be overridden.
 */
export interface RecordProductSaleRequest {
  productId: string;
  /** Override the product price if different (e.g., discount) */
  salePrice?: number;
  source: SaleSource;
  etsyOrderId?: string;
  etsyReceiptId?: string;
  soldAt: string;
}

export interface RecordProductSaleResponse {
  sale: Sale;
}

// ============================================================================
// Sync Etsy Sales
// ============================================================================

export interface SyncEtsySalesRequest {
  /** Only sync sales since this date (ISO string) */
  since?: string;
}

export interface SyncEtsySalesResponse {
  /** Number of new sales recorded */
  recorded: number;
  /** Number of sales already in system */
  skipped: number;
  /** Any errors encountered */
  errors: string[];
}
