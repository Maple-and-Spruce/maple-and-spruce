/**
 * Get Artists Cloud Function
 *
 * Retrieves all artists, optionally filtered by status.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import type {
  GetArtistsRequest,
  GetArtistsResponse,
} from '@maple/ts/firebase/api-types';

export const getArtists = createAdminFunction<
  GetArtistsRequest,
  GetArtistsResponse
>(async (data) => {
  const artists = await ArtistRepository.findAll({
    status: data.status,
  });

  return { artists };
});
