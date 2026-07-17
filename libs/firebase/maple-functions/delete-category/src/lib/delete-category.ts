/**
 * Delete Category Cloud Function
 *
 * Deletes a category (admin only).
 * Will fail if products are using this category.
 */
import {
  createRoleFunction,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import { CategoryRepository } from '@maple/firebase/database';
import type {
  DeleteCategoryRequest,
  DeleteCategoryResponse,
} from '@maple/ts/firebase/api-types';

export const deleteCategory = createRoleFunction<
  DeleteCategoryRequest,
  DeleteCategoryResponse
>(async (data) => {
  // Check category exists
  const existing = await CategoryRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Category', data.id);
  }

  // Check if any products are using this category
  const productCount = await CategoryRepository.countProductsWithCategory(
    data.id
  );
  if (productCount > 0) {
    throw new Error(
      `Cannot delete category "${existing.name}" because ${productCount} product(s) are using it. ` +
        'Please reassign or remove the category from those products first.'
    );
  }

  await CategoryRepository.delete(data.id);

  return { success: true };
}, [Role.Admin, Role.Clerk]);
