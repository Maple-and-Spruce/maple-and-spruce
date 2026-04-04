/**
 * Save Etsy Artist Template Cloud Function
 *
 * Creates or updates Etsy listing overrides for a specific artist.
 * Artist overrides layer on top of category defaults when merging.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { EtsyTemplateRepository } from '@maple/firebase/database';
import type {
  SaveEtsyArtistTemplateRequest,
  SaveEtsyArtistTemplateResponse,
} from '@maple/ts/firebase/api-types';

export const saveEtsyArtistTemplate = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<SaveEtsyArtistTemplateRequest, SaveEtsyArtistTemplateResponse>(
    async (data) => {
      const { artistId, artistName, defaults } = data;

      if (!artistId) {
        throw new Error('artistId is required');
      }
      if (!artistName) {
        throw new Error('artistName is required');
      }

      const template = await EtsyTemplateRepository.saveArtistTemplate(
        artistId,
        artistName,
        defaults
      );

      return { template };
    }
  );
