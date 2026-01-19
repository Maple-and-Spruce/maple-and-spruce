/**
 * Reorder Categories Cloud Function
 *
 * Reorders all categories by updating their order values based on position in the provided array.
 * This is an admin-only operation that uses batch writes for atomicity.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { CategoryRepository } from '@maple/firebase/database';
import type {
  ReorderCategoriesRequest,
  ReorderCategoriesResponse,
} from '@maple/ts/firebase/api-types';

export const reorderCategories = createAdminFunction<
  ReorderCategoriesRequest,
  ReorderCategoriesResponse
>(async (data) => {
  const { categoryIds } = data;

  // Validate input
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    throw new Error('categoryIds must be a non-empty array');
  }

  // Verify all category IDs exist
  const existingCategories = await CategoryRepository.findAll();
  const existingIds = new Set(existingCategories.map((c) => c.id));

  const invalidIds = categoryIds.filter((id) => !existingIds.has(id));
  if (invalidIds.length > 0) {
    throw new Error(`Invalid category IDs: ${invalidIds.join(', ')}`);
  }

  // Check for duplicates in the input
  const uniqueIds = new Set(categoryIds);
  if (uniqueIds.size !== categoryIds.length) {
    throw new Error('Duplicate category IDs in request');
  }

  // Reorder all categories
  const categories = await CategoryRepository.reorderAll(categoryIds);

  return { categories };
});
