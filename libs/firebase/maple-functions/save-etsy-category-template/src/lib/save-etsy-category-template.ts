/**
 * Save Etsy Category Template Cloud Function
 *
 * Creates or updates Etsy listing defaults for a product category.
 * These defaults pre-fill the Etsy section of the ProductForm.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { EtsyTemplateRepository } from '@maple/firebase/database';
import type {
  SaveEtsyCategoryTemplateRequest,
  SaveEtsyCategoryTemplateResponse,
} from '@maple/ts/firebase/api-types';

export const saveEtsyCategoryTemplate = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<SaveEtsyCategoryTemplateRequest, SaveEtsyCategoryTemplateResponse>(
    async (data) => {
      const { categoryId, categoryName, defaults } = data;

      if (!categoryId) {
        throw new Error('categoryId is required');
      }
      if (!categoryName) {
        throw new Error('categoryName is required');
      }

      const template = await EtsyTemplateRepository.saveCategoryTemplate(
        categoryId,
        categoryName,
        defaults
      );

      return { template };
    }
  );
