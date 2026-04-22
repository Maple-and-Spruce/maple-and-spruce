/**
 * Create Class Category Cloud Function
 *
 * Creates a new class category (admin only).
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { ClassCategoryRepository } from '@maple/firebase/database';
import { classCategoryValidation } from '@maple/ts/validation';
import type {
  CreateClassCategoryRequest,
  CreateClassCategoryResponse,
} from '@maple/ts/firebase/api-types';

export const createClassCategory = createAdminFunction<
  CreateClassCategoryRequest,
  CreateClassCategoryResponse
>(async (data) => {
  const validationResult = classCategoryValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const existing = await ClassCategoryRepository.findByName(data.name);
  if (existing) {
    throw new Error(`A class category with name "${data.name}" already exists`);
  }

  const category = await ClassCategoryRepository.create(data);

  return { category };
});
