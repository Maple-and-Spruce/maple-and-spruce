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
 * Products support multiple variants (e.g. size, color). Most products
 * have a single "Regular" variant. Each variant maps 1:1 to a Square
 * ITEM_VARIATION and an Etsy inventory product.
 *
 * @see ADR-010 for hybrid inventory architecture
 * @see ADR-011 for sync strategy details
 */
import type { EtsyCache } from './etsy';

/**
 * A product variant (e.g. size, color).
 *
 * Most products have a single variant with label "Regular".
 * Each variant maps to one Square ITEM_VARIATION and one Etsy inventory product.
 */
export interface ProductVariant {
  /** Internal variant ID (auto-generated) */
  id: string;
  /** Display label: "Regular", "Small", "Blue", etc. */
  label: string;
  /** Product SKU for barcode scanning */
  sku: string;
  /** Price in cents (e.g., 2500 = $25.00) */
  priceCents: number;
  /** Current inventory quantity */
  quantity: number;
  /** Square item variation ID */
  squareVariationId?: string;
  /** Etsy per-variant product ID */
  etsyProductId?: number;
}

/**
 * Cached data from Square for display without API calls.
 *
 * This data may be stale. For authoritative data, query Square directly.
 * Updated via:
 * - Webhooks (real-time on sales/inventory changes)
 * - Lazy refresh (on product access if stale)
 * - Periodic sync (nightly safety net)
 *
 * Listing-level fields only. Per-variant data (price, quantity, SKU)
 * lives on ProductVariant.
 */
export interface SquareCache {
  name: string;
  description?: string;
  /** Primary product image URL */
  imageUrl?: string;
  /** When this cache was last synced from Square */
  syncedAt: Date;

  // --- Deprecated: per-variant data now lives on ProductVariant ---
  // These fields are populated from variants[0] for backward compatibility.
  // Consumers should migrate to reading from product.variants[].

  /** @deprecated Use product.variants[].priceCents */
  priceCents?: number;
  /** @deprecated Use product.variants[].quantity */
  quantity?: number;
  /** @deprecated Use product.variants[].sku */
  sku?: string;
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

  // === VARIANTS ===

  /**
   * Product variants (minimum 1). Most products have a single "Regular" variant.
   * Each variant has its own SKU, price, quantity, and external system IDs.
   */
  variants: ProductVariant[];

  /**
   * Labels for what variants represent (e.g. ["Size"], ["Color", "Size"]).
   * Empty or undefined for single-variant products.
   */
  variantProperties?: string[];

  // === EXTERNAL SYSTEM LINKS ===

  /** Square catalog item ID - Required, Square is catalog owner */
  squareItemId: string;

  /** @deprecated Use product.variants[].squareVariationId */
  squareVariationId?: string;

  /** Square catalog version for optimistic locking on updates */
  squareCatalogVersion?: number;

  /** Square location ID where inventory is tracked */
  squareLocationId?: string;

  /** Etsy listing ID - Optional, product may not be listed on Etsy */
  etsyListingId?: string;

  // === CACHED DATA (may be stale, for display only) ===

  /**
   * Cached listing-level data from Square for fast reads.
   * Check syncedAt to determine freshness.
   */
  squareCache: SquareCache;

  /**
   * Cached data from Etsy listing for fast reads.
   * Only present if the product is listed on Etsy.
   */
  etsyCache?: EtsyCache;
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
 * Generate a unique variant ID
 */
export function generateVariantId(): string {
  return `var_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Get total quantity across all variants
 */
export function getTotalQuantity(product: Pick<Product, 'variants'>): number {
  return product.variants.reduce((sum, v) => sum + v.quantity, 0);
}

/**
 * Find a variant by ID
 */
export function findVariant(
  product: Pick<Product, 'variants'>,
  variantId: string
): ProductVariant | undefined {
  return product.variants.find((v) => v.id === variantId);
}

/**
 * Find a variant by Square variation ID
 */
export function findVariantBySquareId(
  product: Pick<Product, 'variants'>,
  squareVariationId: string
): ProductVariant | undefined {
  return product.variants.find(
    (v) => v.squareVariationId === squareVariationId
  );
}

/**
 * Find a variant by Etsy product ID
 */
export function findVariantByEtsyProductId(
  product: Pick<Product, 'variants'>,
  etsyProductId: number
): ProductVariant | undefined {
  return product.variants.find((v) => v.etsyProductId === etsyProductId);
}

/**
 * Check if a product has multiple variants (not just the default "Regular")
 */
export function isMultiVariant(product: Pick<Product, 'variants'>): boolean {
  return product.variants.length > 1;
}

/**
 * Resolve CreateProductInput to a normalized variants array.
 * If variants[] is provided, use it. Otherwise, create a single "Regular"
 * variant from the legacy priceCents/quantity fields.
 */
export function resolveVariants(
  input: Pick<
    CreateProductInput,
    'variants' | 'priceCents' | 'quantity'
  >
): CreateVariantInput[] {
  if (input.variants && input.variants.length > 0) {
    return input.variants;
  }
  return [
    {
      label: 'Regular',
      priceCents: input.priceCents ?? 0,
      quantity: input.quantity ?? 0,
    },
  ];
}

/**
 * Input for a product variant during creation
 */
export interface CreateVariantInput {
  label: string;
  priceCents: number;
  quantity: number;
  /** SKU is auto-generated if not provided */
  sku?: string;
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

  /**
   * Product variants. If omitted, a single "Regular" variant is created
   * from the top-level priceCents/quantity fields for backward compatibility.
   */
  variants?: CreateVariantInput[];

  /**
   * Labels for variant dimensions (e.g. ["Size"], ["Color"]).
   * Only meaningful when variants has more than 1 entry.
   */
  variantProperties?: string[];

  // === Legacy single-variant fields (used when variants is omitted) ===

  /** Price in cents — used when variants is omitted */
  priceCents?: number;
  /** Initial inventory quantity — used when variants is omitted */
  quantity?: number;
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

  /** Updated variants (replaces all variants) */
  variants?: CreateVariantInput[];
  variantProperties?: string[];

  // === Legacy single-variant fields ===
  /** Price in cents — applies to first variant when variants is omitted */
  priceCents?: number;
  /** Quantity — applies to first variant when variants is omitted */
  quantity?: number;
}

/**
 * Result of creating a single variation in Square
 */
export interface SquareVariationResult {
  /** Internal variant ID (matches ProductVariant.id) */
  variantId: string;
  squareVariationId: string;
  sku: string;
}

/**
 * Result of creating a product in Square
 */
export interface SquareProductResult {
  squareItemId: string;
  squareCatalogVersion: number;
  squareLocationId: string;
  /** Per-variation results */
  variations: SquareVariationResult[];

  // === Legacy fields for backward compatibility ===
  /** @deprecated Use variations[0].squareVariationId */
  squareVariationId: string;
  /** @deprecated Use variations[0].sku */
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
