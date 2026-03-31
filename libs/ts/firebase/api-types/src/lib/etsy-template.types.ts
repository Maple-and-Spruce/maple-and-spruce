/**
 * Etsy Template API request/response types
 *
 * Types for managing Etsy listing templates (category defaults + artist overrides).
 */
import type {
  EtsyListingDefaults,
  EtsyCategoryTemplate,
  EtsyArtistTemplate,
} from '@maple/ts/domain';

// ============================================================================
// Get Etsy Templates (merged for a category+artist pair)
// ============================================================================

export interface GetEtsyTemplatesRequest {
  categoryId?: string;
  artistId?: string;
}

export interface GetEtsyTemplatesResponse {
  /** Merged defaults (category base + artist overrides) */
  merged: EtsyListingDefaults;
  /** Raw category template, if found */
  categoryTemplate?: EtsyCategoryTemplate;
  /** Raw artist template, if found */
  artistTemplate?: EtsyArtistTemplate;
}

// ============================================================================
// Save Etsy Category Template
// ============================================================================

export interface SaveEtsyCategoryTemplateRequest {
  categoryId: string;
  categoryName: string;
  defaults: EtsyListingDefaults;
}

export interface SaveEtsyCategoryTemplateResponse {
  template: EtsyCategoryTemplate;
}

// ============================================================================
// Save Etsy Artist Template
// ============================================================================

export interface SaveEtsyArtistTemplateRequest {
  artistId: string;
  artistName: string;
  defaults: EtsyListingDefaults;
}

export interface SaveEtsyArtistTemplateResponse {
  template: EtsyArtistTemplate;
}
