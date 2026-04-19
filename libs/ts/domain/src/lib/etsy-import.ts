/**
 * Etsy import snapshot
 *
 * Stored in `etsy-imports/{productId}` — one record per imported Etsy listing.
 * Captures the full raw Etsy API response at import time so we can:
 *   - mine it later for insights (taxonomy/tag/material frequency) to seed templates
 *   - reconstruct state if the listing is later edited or deleted on Etsy
 *
 * This is a snapshot, not a live mirror. Subsequent Etsy edits are not
 * reflected here — update the Product.etsyCache for current display data.
 */

/** Unknown-shape JSON blob captured directly from the Etsy API response. */
export type EtsyRawPayload = Record<string, unknown>;

export interface EtsyImport {
  /** Same as the Product.id this snapshot belongs to */
  id: string;

  /** Etsy listing_id as a string (Etsy returns a number; stored as string for consistency with etsyListingId) */
  listingId: string;

  /** Full raw listing JSON from GET /listings/{id}?includes=Images,Inventory */
  rawListing: EtsyRawPayload;

  /** Raw inventory JSON if fetched separately (may be embedded in rawListing.inventory) */
  rawInventory?: EtsyRawPayload;

  /** Number of product variants on the listing at import time (for filtering/insights) */
  variantCount: number;

  /** Admin user ID who performed the import */
  importedBy: string;

  importedAt: Date;
}
