/**
 * Reorder Class Categories Cloud Function
 *
 * Reorders all class categories by updating their order values based on
 * position in the provided array. Uses batch writes for atomicity.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { ClassCategoryRepository } from '@maple/firebase/database';
import type {
  ReorderClassCategoriesRequest,
  ReorderClassCategoriesResponse,
} from '@maple/ts/firebase/api-types';

export const reorderClassCategories = createAdminFunction<
  ReorderClassCategoriesRequest,
  ReorderClassCategoriesResponse
>(async (data) => {
  const { categoryIds } = data;

  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    throw new Error('categoryIds must be a non-empty array');
  }

  const existingCategories = await ClassCategoryRepository.findAll();
  const existingIds = new Set(existingCategories.map((c) => c.id));

  const invalidIds = categoryIds.filter((id) => !existingIds.has(id));
  if (invalidIds.length > 0) {
    throw new Error(`Invalid class category IDs: ${invalidIds.join(', ')}`);
  }

  const uniqueIds = new Set(categoryIds);
  if (uniqueIds.size !== categoryIds.length) {
    throw new Error('Duplicate category IDs in request');
  }

  const categories = await ClassCategoryRepository.reorderAll(categoryIds);

  return { categories };
});
