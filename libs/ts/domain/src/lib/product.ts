/**
 * Product domain types
 *
 * Product in Firestore is a LINKING RECORD - catalog details (name, price,
 * quantity) are owned by Square. Firestore stores external IDs, artist
 * relationship, and cached display data.
 */

export interface Product {
  id: string;
  artistId: string;

  // External system IDs (sync anchors)
  /** Square catalog item ID - Required, Square is catalog owner */
  squareItemId: string;
  /** Square item variation ID */
  squareVariationId: string;
  /** Square catalog version for optimistic locking */
  squareCatalogVersion?: number;
  /** Etsy listing ID - Optional, may not be listed on Etsy */
  etsyListingId?: string;

  // Cached from Square (for display without API call)
  name: string;
  description?: string;
  price: number;
  quantity: number;
  sku: string;
  imageUrl?: string;

  /**
   * Commission override for this specific product.
   * If undefined, uses artist's defaultCommissionRate.
   */
  customCommissionRate?: number;

  // Sync metadata
  lastSquareSyncAt?: Date;
  lastEtsySyncAt?: Date;

  status: ProductStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductStatus = 'active' | 'draft' | 'discontinued';

/**
 * Input for creating a new product
 */
export type CreateProductInput = Omit<
  Product,
  | 'id'
  | 'createdAt'
  | 'updatedAt'
  | 'squareItemId'
  | 'squareVariationId'
  | 'sku'
  | 'lastSquareSyncAt'
  | 'lastEtsySyncAt'
> & {
  // These are optional on creation - will be populated after Square sync
  squareItemId?: string;
  squareVariationId?: string;
  sku?: string;
};

/**
 * Input for updating a product
 */
export type UpdateProductInput = Partial<
  Omit<Product, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

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
