/**
 * Etsy Receipt (Order) types
 *
 * Types for the Etsy Receipts API, which represents orders/purchases.
 * A receipt contains one or more transactions (line items).
 *
 * @see https://developers.etsy.com/documentation/reference/#operation/getShopReceipts
 */
import type { EtsyMoney } from './common.types.js';

/** A single transaction (line item) within a receipt */
export interface EtsyTransaction {
  transaction_id: number;
  listing_id: number;
  product_id: number;
  quantity: number;
  price: EtsyMoney;
  title: string;
  sku: string;
}

/** An Etsy receipt (order) */
export interface EtsyReceipt {
  receipt_id: number;
  receipt_type: number;
  order_id: number;
  buyer_email: string;
  name: string;
  /** 'paid', 'completed', 'open', etc. */
  status: string;
  transactions: EtsyTransaction[];
  create_timestamp: number;
  update_timestamp: number;
  grandtotal: EtsyMoney;
}
