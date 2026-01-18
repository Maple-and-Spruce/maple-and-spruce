/**
 * Get Artist Cloud Function
 *
 * Retrieves a single artist by ID.
 */
import { createAuthenticatedFunction, throwNotFound } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import type {
  GetArtistRequest,
  GetArtistResponse,
} from '@maple/ts/firebase/api-types';

export const getArtist = createAuthenticatedFunction<
  GetArtistRequest,
  GetArtistResponse
>(async (data) => {
  const artist = await ArtistRepository.findById(data.id);

  if (!artist) {
    throwNotFound('Artist', data.id);
  }

  return { artist };
});
