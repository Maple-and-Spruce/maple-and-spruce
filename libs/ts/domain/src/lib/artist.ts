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
  /** Commission rate as decimal (e.g., 0.40 = 40% to store, 60% to artist) */
  commissionRate: number;
  status: ArtistStatus;
  notes?: string;
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
export type UpdateArtistInput = Partial<Omit<Artist, 'id' | 'createdAt' | 'updatedAt'>> & {
  id: string;
};
