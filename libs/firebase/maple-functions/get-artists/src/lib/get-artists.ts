/**
 * Get Artists Cloud Function
 *
 * Retrieves all artists, optionally filtered by status.
 * Deployed via CI/CD pipeline.
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import type {
  GetArtistsRequest,
  GetArtistsResponse,
} from '@maple/ts/firebase/api-types';

export const getArtists = createAuthenticatedFunction<
  GetArtistsRequest,
  GetArtistsResponse
>(async (data) => {
  const artists = await ArtistRepository.findAll({
    status: data.status,
  });

  return { artists };
});
