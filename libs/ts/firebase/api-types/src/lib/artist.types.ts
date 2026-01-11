/**
 * Artist API request/response types
 *
 * Types for Firebase Cloud Function calls related to artists.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Artist,
  CreateArtistInput,
  UpdateArtistInput,
  ArtistStatus,
} from '@maple/ts/domain';

// ============================================================================
// Get Artists
// ============================================================================

export interface GetArtistsRequest {
  /** Optional status filter */
  status?: ArtistStatus;
}

export interface GetArtistsResponse {
  artists: Artist[];
}

// ============================================================================
// Get Artist by ID
// ============================================================================

export interface GetArtistRequest {
  id: string;
}

export interface GetArtistResponse {
  artist: Artist;
}

// ============================================================================
// Create Artist
// ============================================================================

export interface CreateArtistRequest extends CreateArtistInput {}

export interface CreateArtistResponse {
  artist: Artist;
}

// ============================================================================
// Update Artist
// ============================================================================

export interface UpdateArtistRequest extends UpdateArtistInput {}

export interface UpdateArtistResponse {
  artist: Artist;
}

// ============================================================================
// Delete Artist
// ============================================================================

export interface DeleteArtistRequest {
  id: string;
}

export interface DeleteArtistResponse {
  success: boolean;
}
