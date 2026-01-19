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
// Upload Product Image
// ============================================================================

export interface UploadProductImageRequest {
  /** Product ID (required - product must exist in Firestore) */
  productId: string;
  /** Base64-encoded image data */
  imageBase64: string;
  /** MIME type of the image (e.g., 'image/jpeg', 'image/png') */
  contentType: string;
  /** Optional caption for the image */
  caption?: string;
}

export interface UploadProductImageResponse {
  success: boolean;
  /** Public URL of the uploaded image (hosted by Square) */
  imageUrl: string;
  /** Square image ID */
  squareImageId: string;
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
