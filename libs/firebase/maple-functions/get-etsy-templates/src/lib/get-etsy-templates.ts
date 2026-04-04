/**
 * Get Etsy Templates Cloud Function
 *
 * Returns the merged Etsy listing defaults for a category+artist pair.
 * Used by the ProductForm to pre-fill Etsy-specific fields.
 *
 * In maple-core codebase — read-only, no Etsy API dependency.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { EtsyTemplateRepository } from '@maple/firebase/database';
import { mergeEtsyTemplates } from '@maple/ts/domain';
import type {
  GetEtsyTemplatesRequest,
  GetEtsyTemplatesResponse,
} from '@maple/ts/firebase/api-types';

export const getEtsyTemplates = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<GetEtsyTemplatesRequest, GetEtsyTemplatesResponse>(
    async (data) => {
      const { categoryId, artistId } = data;

      const [categoryTemplate, artistTemplate] = await Promise.all([
        categoryId
          ? EtsyTemplateRepository.getCategoryTemplate(categoryId)
          : Promise.resolve(undefined),
        artistId
          ? EtsyTemplateRepository.getArtistTemplate(artistId)
          : Promise.resolve(undefined),
      ]);

      const merged = mergeEtsyTemplates(categoryTemplate, artistTemplate);

      return {
        merged,
        categoryTemplate,
        artistTemplate,
      };
    }
  );
