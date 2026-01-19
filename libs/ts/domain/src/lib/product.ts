/**
 * Product domain types
 *
 * Product in Firestore is a LINKING RECORD that connects:
 * - A Square catalog item (source of truth for catalog/inventory)
 * - To an artist (consignment relationship)
 * - With business rules (commission rates)
 *
 * Square owns: name, description, price, quantity, SKU, images
 * Firestore owns: artist relationship, commission rates, status
 *
 * @see ADR-011 for sync strategy details
 */

/**
 * Cached data from Square for display without API calls.
 *
 * This data may be stale. For authoritative data, query Square directly.
 * Updated via:
 * - Webhooks (real-time on sales/inventory changes)
 * - Lazy refresh (on product access if stale)
 * - Periodic sync (nightly safety net)
 */
export interface SquareCache {
  name: string;
  description?: string;
  /** Price in cents (e.g., 2500 = $25.00) */
  priceCents: number;
  /** Current inventory quantity */
  quantity: number;
  /** Product SKU for barcode scanning */
  sku: string;
  /** Primary product image URL */
  imageUrl?: string;
  /** When this cache was last synced from Square */
  syncedAt: Date;
}

/**
 * Product record in Firestore
 *
 * Serves as a linking table between Square catalog and our business logic.
 */
export interface Product {
  id: string;

  // === OWNED BY FIRESTORE (authoritative) ===

  /** Artist who created/consigns this product */
  artistId: string;

  /** Category for filtering and organization */
  categoryId?: string;

  /**
   * Commission override for this specific product.
   * If undefined, uses artist's defaultCommissionRate.
   */
  customCommissionRate?: number;

  /** Product lifecycle status */
  status: ProductStatus;

  createdAt: Date;
  updatedAt: Date;

  // === EXTERNAL SYSTEM LINKS ===

  /** Square catalog item ID - Required, Square is catalog owner */
  squareItemId: string;

  /** Square item variation ID (for inventory tracking) */
  squareVariationId: string;

  /** Square catalog version for optimistic locking on updates */
  squareCatalogVersion?: number;

  /** Square location ID where inventory is tracked */
  squareLocationId?: string;

  /** Etsy listing ID - Optional, product may not be listed on Etsy */
  etsyListingId?: string;

  // === CACHED DATA (may be stale, for display only) ===

  /**
   * Cached data from Square for fast reads.
   * Check syncedAt to determine freshness.
   */
  squareCache: SquareCache;
}

export type ProductStatus = 'active' | 'draft' | 'discontinued';

/**
 * How stale is acceptable for cached data (in milliseconds)
 */
export const CACHE_STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Check if the Square cache needs refreshing
 */
export function isCacheStale(product: Pick<Product, 'squareCache'>): boolean {
  const age = Date.now() - product.squareCache.syncedAt.getTime();
  return age > CACHE_STALE_THRESHOLD_MS;
}

/**
 * Input for creating a new product
 *
 * Square IDs and cache are populated after Square API call.
 */
export interface CreateProductInput {
  // Required - owned by Firestore
  artistId: string;
  status: ProductStatus;

  // Optional - owned by Firestore
  categoryId?: string;
  customCommissionRate?: number;

  // Required - will be sent to Square to create catalog item
  name: string;
  description?: string;
  /** Price in cents */
  priceCents: number;
  /** Initial inventory quantity */
  quantity: number;
}

/**
 * Input for updating a product
 *
 * Can update Firestore-owned fields directly.
 * Square-owned fields (name, price, etc.) trigger Square API update.
 */
export interface UpdateProductInput {
  id: string;

  // Firestore-owned (update directly)
  artistId?: string;
  categoryId?: string;
  customCommissionRate?: number;
  status?: ProductStatus;

  // Square-owned (triggers Square API call)
  name?: string;
  description?: string;
  /** Price in cents */
  priceCents?: number;

  // Inventory changes go through Inventory API
  quantity?: number;
}

/**
 * Result of creating a product in Square
 */
export interface SquareProductResult {
  squareItemId: string;
  squareVariationId: string;
  squareCatalogVersion: number;
  squareLocationId: string;
  sku: string;
}

/**
 * Generate an opaque SKU for a new product
 */
export function generateSku(): string {
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `prd_${randomPart}`;
}

/**
 * Get effective commission rate for a product
 */
export function getEffectiveCommissionRate(
  product: Pick<Product, 'customCommissionRate'>,
  artistDefaultRate: number
): number {
  return product.customCommissionRate ?? artistDefaultRate;
}

/**
 * Convert price from cents to display dollars
 */
export function formatPrice(priceCents: number): string {
  return `$${(priceCents / 100).toFixed(2)}`;
}

/**
 * Convert price from dollars to cents
 */
export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}
