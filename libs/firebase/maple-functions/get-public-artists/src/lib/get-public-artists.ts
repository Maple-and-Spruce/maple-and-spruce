/**
 * Get Public Artists Cloud Function
 *
 * Returns active artists with sensitive data stripped for public website display.
 * No authentication required - intended for Webflow integration.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import { ArtistRepository } from '@maple/firebase/database';
import { toPublicArtist } from '@maple/ts/domain';
import type {
  GetPublicArtistsRequest,
  GetPublicArtistsResponse,
} from '@maple/ts/firebase/api-types';

export const getPublicArtists = Functions.endpoint.handle<
  GetPublicArtistsRequest,
  GetPublicArtistsResponse
>(async () => {
  // Only fetch active artists for public consumption
  const artists = await ArtistRepository.findAll({ status: 'active' });

  // Strip sensitive data before returning
  const publicArtists = artists.map(toPublicArtist);

  return { artists: publicArtists };
});
