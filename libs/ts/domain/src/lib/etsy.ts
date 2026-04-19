/**
 * Etsy domain types
 *
 * Types for Etsy integration that live in the domain layer —
 * used by both the admin app and Cloud Functions.
 */

/**
 * Cached data from an Etsy listing for display without API calls.
 *
 * Mirrors the pattern of SquareCache on the Product type.
 * This data may be stale; for authoritative data, query Etsy directly.
 */
export interface EtsyCache {
  title: string;
  description?: string;
  /** Public Etsy listing URL */
  url?: string;
  /** Etsy taxonomy category ID */
  taxonomyId: number;
  /** Listing tags */
  tags?: string[];
  /** Listing state on Etsy */
  state: 'active' | 'draft' | 'inactive';
  /** When this cache was last synced from Etsy */
  syncedAt: Date;

  // --- Deprecated: per-variant data now lives on ProductVariant ---

  /** @deprecated Use product.variants[].priceCents */
  priceCents?: number;
  /** @deprecated Use product.variants[].quantity */
  quantity?: number;
}

/**
 * Default values for Etsy listing fields.
 *
 * Used by both EtsyCategoryTemplate and EtsyArtistTemplate.
 * When merging, category provides the base and artist overrides.
 */
export interface EtsyListingDefaults {
  /** Etsy taxonomy category ID */
  taxonomyId?: number;
  /** Tags for search discovery (max 13 when merged) */
  tags?: string[];
  /** Materials used in the product */
  materials?: string[];
  /** Who made the item */
  whoMade?: 'i_did' | 'someone_else' | 'collective';
  /** When the item was made */
  whenMade?: string;
  /** Whether the item is a supply or tool */
  isSupply?: boolean;
  /** Etsy shipping profile ID */
  shippingProfileId?: number;
  /** Etsy shop section ID */
  shopSectionId?: number;
}

/**
 * Category-level Etsy listing defaults.
 *
 * Stored in `etsy-category-templates/{categoryId}` in Firestore.
 * Provides base defaults for all products in a category.
 */
export interface EtsyCategoryTemplate extends EtsyListingDefaults {
  /** Matches the Firestore category ID */
  id: string;
  /** Denormalized category name for display */
  categoryName: string;
  updatedAt: Date;
}

/**
 * Artist-level Etsy listing overrides.
 *
 * Stored in `etsy-artist-templates/{artistId}` in Firestore.
 * Overrides category defaults for a specific artist's products.
 */
export interface EtsyArtistTemplate extends EtsyListingDefaults {
  /** Matches the Firestore artist ID */
  id: string;
  /** Denormalized artist name for display */
  artistName: string;
  updatedAt: Date;
}

/**
 * Merge category-level defaults with artist-level overrides.
 *
 * Merge strategy:
 * - Tags: additive (category tags + artist tags, capped at 13)
 * - Materials: additive (category + artist, deduplicated)
 * - All other fields: artist value replaces category value if defined
 *
 * @param categoryTemplate - Base defaults from the product's category
 * @param artistTemplate - Overrides from the product's artist
 * @returns Merged defaults ready to pre-fill the Etsy listing form
 */
export function mergeEtsyTemplates(
  categoryTemplate?: EtsyListingDefaults,
  artistTemplate?: EtsyListingDefaults
): EtsyListingDefaults {
  const base = categoryTemplate ?? {};
  const overrides = artistTemplate ?? {};

  // Merge tags: additive, capped at 13
  const mergedTags = [
    ...new Set([...(base.tags ?? []), ...(overrides.tags ?? [])]),
  ].slice(0, 13);

  // Merge materials: additive, deduplicated
  const mergedMaterials = [
    ...new Set([...(base.materials ?? []), ...(overrides.materials ?? [])]),
  ];

  return {
    taxonomyId: overrides.taxonomyId ?? base.taxonomyId,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
    materials: mergedMaterials.length > 0 ? mergedMaterials : undefined,
    whoMade: overrides.whoMade ?? base.whoMade,
    whenMade: overrides.whenMade ?? base.whenMade,
    isSupply: overrides.isSupply ?? base.isSupply,
    shippingProfileId: overrides.shippingProfileId ?? base.shippingProfileId,
    shopSectionId: overrides.shopSectionId ?? base.shopSectionId,
  };
}
