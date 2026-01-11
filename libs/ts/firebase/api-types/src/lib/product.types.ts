/**
 * Product API request/response types
 *
 * Types for Firebase Cloud Function calls related to products.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Product,
  CreateProductInput,
  UpdateProductInput,
  ProductStatus,
} from '@maple/ts/domain';

// ============================================================================
// Get Products
// ============================================================================

export interface GetProductsRequest {
  /** Filter by artist ID */
  artistId?: string;
  /** Filter by status */
  status?: ProductStatus;
}

export interface GetProductsResponse {
  products: Product[];
}

// ============================================================================
// Get Product by ID
// ============================================================================

export interface GetProductRequest {
  id: string;
}

export interface GetProductResponse {
  product: Product;
}

// ============================================================================
// Create Product
// ============================================================================

export interface CreateProductRequest extends CreateProductInput {}

export interface CreateProductResponse {
  product: Product;
}

// ============================================================================
// Update Product
// ============================================================================

export interface UpdateProductRequest extends UpdateProductInput {}

export interface UpdateProductResponse {
  product: Product;
}

// ============================================================================
// Delete Product
// ============================================================================

export interface DeleteProductRequest {
  id: string;
}

export interface DeleteProductResponse {
  success: boolean;
}

// ============================================================================
// Sync from Etsy
// ============================================================================

export interface SyncEtsyProductsRequest {
  /** Only sync products that have changed since this date */
  since?: string;
}

export interface SyncEtsyProductsResponse {
  /** Number of products created */
  created: number;
  /** Number of products updated */
  updated: number;
  /** Number of products unchanged */
  unchanged: number;
  /** Any errors encountered */
  errors: string[];
}
