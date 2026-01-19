/**
 * Get Categories Cloud Function
 *
 * Retrieves all categories, ordered by display order.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { CategoryRepository } from '@maple/firebase/database';
import type {
  GetCategoriesRequest,
  GetCategoriesResponse,
} from '@maple/ts/firebase/api-types';

export const getCategories = createAuthenticatedFunction<
  GetCategoriesRequest,
  GetCategoriesResponse
>(async () => {
  const categories = await CategoryRepository.findAll();

  return { categories };
});
