/**
 * Artist domain types
 *
 * Represents artists who consign items through Maple & Spruce.
 * Commission rate determines the split between store and artist on sales.
 *
 * Implements the Payee interface for shared payment/payout infrastructure.
 * Artists have commission-based payments (different from Instructors who have per-class payments).
 */

import type { Payee, PayeeStatus, PayoutMethod } from './payee';

/**
 * Artist entity - implements Payee interface with consignment-specific fields.
 */
export interface Artist extends Payee {
  /**
   * Default commission rate as decimal (e.g., 0.40 = 40% to store, 60% to artist).
   * Can be overridden at the product level.
   */
  defaultCommissionRate: number;
  /**
   * Webflow CMS item ID.
   * Set after syncing to Webflow, used for updates/deletes.
   * @see docs/decisions/ADR-016-webflow-integration-strategy.md
   */
  webflowItemId?: string;
  /**
   * When true, prevents auto-publishing to Webflow.
   * The artist will still sync to CMS but remain as a draft until manually published.
   * Defaults to false (auto-publish enabled).
   */
  preventAutoPublish?: boolean;
}

/**
 * @deprecated Use PayeeStatus from './payee' instead.
 * Kept for backwards compatibility.
 */
export type ArtistStatus = PayeeStatus;

/**
 * Input for creating a new artist (no id, timestamps auto-generated)
 */
export type CreateArtistInput = Omit<Artist, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Input for updating an artist (all fields optional except id)
 */
export type UpdateArtistInput = Partial<
  Omit<Artist, 'id' | 'createdAt' | 'updatedAt'>
> & {
  id: string;
};

/**
 * Public-facing artist information for website display.
 * Excludes sensitive data like email, commission rates, internal notes,
 * status (only active artists are returned), and timestamps.
 */
export interface PublicArtist {
  id: string;
  name: string;
  photoUrl?: string;
}

/**
 * Convert a full Artist to PublicArtist by stripping sensitive fields.
 * Note: Only call this for active artists - filtering should happen at query level.
 */
export function toPublicArtist(artist: Artist): PublicArtist {
  return {
    id: artist.id,
    name: artist.name,
    photoUrl: artist.photoUrl,
  };
}
