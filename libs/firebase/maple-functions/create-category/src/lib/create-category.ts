/**
 * Create Category Cloud Function
 *
 * Creates a new category (admin only).
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { CategoryRepository } from '@maple/firebase/database';
import { categoryValidation } from '@maple/ts/validation';
import type {
  CreateCategoryRequest,
  CreateCategoryResponse,
} from '@maple/ts/firebase/api-types';

export const createCategory = createAdminFunction<
  CreateCategoryRequest,
  CreateCategoryResponse
>(async (data) => {
  // Validate input
  const validationResult = categoryValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for duplicate name
  const existingCategory = await CategoryRepository.findByName(data.name);
  if (existingCategory) {
    throw new Error(`A category with name "${data.name}" already exists`);
  }

  const category = await CategoryRepository.create(data);

  return { category };
});
