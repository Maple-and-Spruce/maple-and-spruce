/**
 * Update Class Category Cloud Function
 *
 * Updates an existing class category (admin only).
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { ClassCategoryRepository } from '@maple/firebase/database';
import { classCategoryValidation } from '@maple/ts/validation';
import type {
  UpdateClassCategoryRequest,
  UpdateClassCategoryResponse,
} from '@maple/ts/firebase/api-types';

export const updateClassCategory = createAdminFunction<
  UpdateClassCategoryRequest,
  UpdateClassCategoryResponse
>(async (data) => {
  const existing = await ClassCategoryRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Class category', data.id);
  }

  const merged = { ...existing, ...data };
  const validationResult = classCategoryValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  if (data.name && data.name !== existing.name) {
    const existingWithName = await ClassCategoryRepository.findByName(data.name);
    if (existingWithName) {
      throw new Error(`A class category with name "${data.name}" already exists`);
    }
  }

  const category = await ClassCategoryRepository.update(data);

  return { category };
});
