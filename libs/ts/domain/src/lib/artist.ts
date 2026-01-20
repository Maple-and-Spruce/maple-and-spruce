/**
 * Artist domain types
 *
 * Represents artists who consign items through Maple & Spruce.
 * Commission rate determines the split between store and artist on sales.
 */

export interface Artist {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /**
   * Default commission rate as decimal (e.g., 0.40 = 40% to store, 60% to artist).
   * Can be overridden at the product level.
   */
  defaultCommissionRate: number;
  status: ArtistStatus;
  notes?: string;
  /**
   * URL to the artist's photo in Firebase Storage.
   * Used for display in admin UI and Webflow integration.
   */
  photoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ArtistStatus = 'active' | 'inactive';

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
 * Excludes sensitive data like email, commission rates, and internal notes.
 */
export interface PublicArtist {
  id: string;
  name: string;
  photoUrl?: string;
  /** Only 'active' artists are returned publicly, but included for type safety */
  status: ArtistStatus;
  createdAt: Date;
}

/**
 * Convert a full Artist to PublicArtist by stripping sensitive fields.
 */
export function toPublicArtist(artist: Artist): PublicArtist {
  return {
    id: artist.id,
    name: artist.name,
    photoUrl: artist.photoUrl,
    status: artist.status,
    createdAt: artist.createdAt,
  };
}
