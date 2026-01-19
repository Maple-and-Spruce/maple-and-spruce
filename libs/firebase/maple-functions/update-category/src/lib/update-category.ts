/**
 * Update Category Cloud Function
 *
 * Updates an existing category (admin only).
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { CategoryRepository } from '@maple/firebase/database';
import { categoryValidation } from '@maple/ts/validation';
import type {
  UpdateCategoryRequest,
  UpdateCategoryResponse,
} from '@maple/ts/firebase/api-types';

export const updateCategory = createAdminFunction<
  UpdateCategoryRequest,
  UpdateCategoryResponse
>(async (data) => {
  // Check category exists
  const existing = await CategoryRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Category', data.id);
  }

  // Validate update data (merge with existing for full validation)
  const merged = { ...existing, ...data };
  const validationResult = categoryValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for duplicate name if name is being changed
  if (data.name && data.name !== existing.name) {
    const existingWithName = await CategoryRepository.findByName(data.name);
    if (existingWithName) {
      throw new Error(`A category with name "${data.name}" already exists`);
    }
  }

  const category = await CategoryRepository.update(data);

  return { category };
});
