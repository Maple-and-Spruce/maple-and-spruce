/**
 * Create Class Cloud Function
 *
 * Creates a new class/workshop.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import { classValidation } from '@maple/ts/validation';
import type {
  CreateClassRequest,
  CreateClassResponse,
} from '@maple/ts/firebase/api-types';

export const createClass = createAdminFunction<
  CreateClassRequest,
  CreateClassResponse
>(async (data) => {
  // Validate input
  const result = classValidation(data);
  if (!result.isValid()) {
    const errors = result.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const classItem = await ClassRepository.create(data);

  return { class: classItem };
});
