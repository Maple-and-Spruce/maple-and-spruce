/**
 * Etsy listing import API types
 *
 * Read-only pull from Etsy into our Product catalog. No writes to Etsy.
 */
import type { Product, ProductStatus } from '@maple/ts/domain';
import type { EtsyListing } from '@maple/firebase/etsy';

// ============================================================================
// List Etsy Listings (for review/import)
// ============================================================================

export interface ListEtsyListingsRequest {
  /** Etsy listing state filter (default: 'active') */
  state?: 'active' | 'inactive' | 'draft' | 'expired' | 'sold_out';
  /** Max listings to return from Etsy (default: 100; Etsy caps at 100 per page) */
  limit?: number;
  /** Pagination offset */
  offset?: number;
}

/**
 * A single listing on the Etsy shop with sync metadata.
 *
 * `listing` is the raw Etsy response so the admin UI can display whatever it
 * wants without us pre-shaping the data.
 */
export interface EtsyListingWithSyncInfo {
  /** Raw Etsy listing including images + inventory */
  listing: EtsyListing;
  /** Whether this listing is already linked to a Firestore Product */
  imported: boolean;
  /** If imported, the Firestore Product.id */
  productId?: string;
  /** Number of product variants (1 for simple listings, >1 for variations) */
  variantCount: number;
  /** Whether this is a simple single-variant listing (supported for import) */
  isSimple: boolean;
}

export interface ListEtsyListingsResponse {
  listings: EtsyListingWithSyncInfo[];
  /** Total listings on Etsy matching the state filter (for pagination) */
  total: number;
}

// ============================================================================
// Import Etsy Listings (bulk)
// ============================================================================

/**
 * Per-listing import input.
 *
 * All selected listings in a batch share the same artist + category +
 * status + optional commission override (the admin UI enforces this for
 * the bulk dialog).
 */
export interface ImportEtsyListingInput {
  /** Etsy listing_id to import */
  listingId: string;
}

export interface ImportEtsyListingsRequest {
  listings: ImportEtsyListingInput[];
  /** Artist to assign to every imported Product in this batch */
  artistId: string;
  /** Category to assign (optional, applied to every imported Product) */
  categoryId?: string;
  /** Status to assign to every imported Product */
  status: ProductStatus;
  /** Optional commission override applied to every imported Product */
  customCommissionRate?: number;
}

export interface ImportEtsyListingResult {
  listingId: string;
  success: boolean;
  /** Created Firestore Product.id on success */
  productId?: string;
  /** Created product (present on success) */
  product?: Product;
  /** Error message on failure, e.g. "Multi-variant listings not supported" */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?:
    | 'ALREADY_IMPORTED'
    | 'MULTI_VARIANT_NOT_SUPPORTED'
    | 'LISTING_NOT_FOUND'
    | 'SQUARE_CREATE_FAILED'
    | 'INTERNAL_ERROR';
}

export interface ImportEtsyListingsResponse {
  results: ImportEtsyListingResult[];
  /** Count of successful imports in this batch */
  successCount: number;
  /** Count of failures in this batch */
  failureCount: number;
}
