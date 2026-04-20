/**
 * Etsy push/update API request/response types
 *
 * Types for pushing products from our catalog to Etsy as native listings.
 */
import type { Product } from '@maple/ts/domain';

// ============================================================================
// Push Product to Etsy (create draft listing)
// ============================================================================

export interface PushProductToEtsyRequest {
  /** Firestore Product ID to push to Etsy */
  productId: string;
  /** If true, activate the listing after push (requires image + shipping profile) */
  activateAfterPush?: boolean;
}

export interface PushProductToEtsyResponse {
  /** Whether the push succeeded */
  success: boolean;
  /** Etsy listing ID on success */
  etsyListingId?: string;
  /** Updated product with Etsy data populated */
  product?: Product;
  /** Error message on failure */
  error?: string;
}

// ============================================================================
// Update Etsy Listing (sync current product data to existing listing)
// ============================================================================

export interface UpdateEtsyListingRequest {
  /** Firestore Product ID whose Etsy listing should be updated */
  productId: string;
}

export interface UpdateEtsyListingResponse {
  /** Whether the update succeeded */
  success: boolean;
  /** Updated product */
  product?: Product;
  /** Error message on failure */
  error?: string;
}
