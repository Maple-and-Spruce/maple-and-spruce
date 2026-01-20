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
  PublicArtist,
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

// ============================================================================
// Upload Artist Image
// ============================================================================

export interface UploadArtistImageRequest {
  /** Artist ID (optional - can upload before creating artist) */
  artistId?: string;
  /** Base64-encoded image data */
  imageBase64: string;
  /** MIME type of the image (e.g., 'image/jpeg', 'image/png') */
  contentType: string;
}

export interface UploadArtistImageResponse {
  success: boolean;
  /** Public URL of the uploaded image */
  url: string;
}

// ============================================================================
// Get Public Artists (no auth required - for Webflow integration)
// ============================================================================

/**
 * Request for public artists endpoint.
 * Currently empty but structured for future pagination support.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GetPublicArtistsRequest {}

export interface GetPublicArtistsResponse {
  /** Active artists with sensitive data stripped */
  artists: PublicArtist[];
}
