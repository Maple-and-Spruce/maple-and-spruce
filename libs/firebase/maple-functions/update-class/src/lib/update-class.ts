/**
 * Update Class Cloud Function
 *
 * Updates an existing class/workshop.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import { classValidation } from '@maple/ts/validation';
import type {
  UpdateClassRequest,
  UpdateClassResponse,
} from '@maple/ts/firebase/api-types';

export const updateClass = createAdminFunction<
  UpdateClassRequest,
  UpdateClassResponse
>(async (data) => {
  // Check if class exists
  const existing = await ClassRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Class', data.id);
  }

  // Validate update data (merge with existing for full validation)
  const merged = { ...existing, ...data };
  const result = classValidation(merged);
  if (!result.isValid()) {
    const errors = result.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const classItem = await ClassRepository.update(data);

  return { class: classItem };
});
