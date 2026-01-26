/**
 * Get Class Categories Cloud Function
 *
 * Retrieves all class categories ordered by display order.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAuthenticatedFunction } from '@maple/firebase/functions';
import { ClassCategoryRepository } from '@maple/firebase/database';
import type {
  GetClassCategoriesRequest,
  GetClassCategoriesResponse,
} from '@maple/ts/firebase/api-types';

export const getClassCategories = createAuthenticatedFunction<
  GetClassCategoriesRequest,
  GetClassCategoriesResponse
>(async () => {
  const categories = await ClassCategoryRepository.findAll();

  return { categories };
});
