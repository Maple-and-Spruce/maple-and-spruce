/**
 * Product domain types
 *
 * Represents inventory items tracked in the system.
 * Products are associated with artists and can be synced from Etsy.
 */

export interface Product {
  id: string;
  artistId: string;
  name: string;
  description?: string;
  price: number;
  sku?: string;
  /** Etsy listing ID when synced from Etsy */
  etsyListingId?: string;
  status: ProductStatus;
  imageUrl?: string;
  createdAt: Date;
  soldAt?: Date;
}

export type ProductStatus = 'available' | 'sold' | 'reserved';

/**
 * Input for creating a new product
 */
export type CreateProductInput = Omit<Product, 'id' | 'createdAt' | 'soldAt'>;

/**
 * Input for updating a product
 */
export type UpdateProductInput = Partial<Omit<Product, 'id' | 'createdAt'>> & {
  id: string;
};
