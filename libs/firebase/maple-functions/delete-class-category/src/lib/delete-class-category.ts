/**
 * Delete Class Category Cloud Function
 *
 * Deletes a class category (admin only).
 * Will fail if classes are using this category.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { ClassCategoryRepository } from '@maple/firebase/database';
import type {
  DeleteClassCategoryRequest,
  DeleteClassCategoryResponse,
} from '@maple/ts/firebase/api-types';

export const deleteClassCategory = createAdminFunction<
  DeleteClassCategoryRequest,
  DeleteClassCategoryResponse
>(async (data) => {
  const existing = await ClassCategoryRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Class category', data.id);
  }

  const hasClasses = await ClassCategoryRepository.hasClasses(data.id);
  if (hasClasses) {
    throw new Error(
      `Cannot delete category "${existing.name}" because classes are using it. ` +
        'Please reassign or remove the category from those classes first.'
    );
  }

  await ClassCategoryRepository.delete(data.id);

  return { success: true };
});
