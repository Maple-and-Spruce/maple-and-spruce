/**
 * Get Artist Cloud Function
 *
 * Retrieves a single artist by ID.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import type {
  GetArtistRequest,
  GetArtistResponse,
} from '@maple/ts/firebase/api-types';

// Admin-only, matching getArtists — Artists is an Admin-group area
// (scoped-roles matrix, epic #617). Was auth-only before the analyzer (#620).
export const getArtist = createAdminFunction<
  GetArtistRequest,
  GetArtistResponse
>(async (data) => {
  const artist = await ArtistRepository.findById(data.id);

  if (!artist) {
    throwNotFound('Artist', data.id);
  }

  return { artist };
});
