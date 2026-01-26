/**
 * Update Instructor Cloud Function
 *
 * Updates an existing instructor (admin only).
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import { instructorValidation } from '@maple/ts/validation';
import type {
  UpdateInstructorRequest,
  UpdateInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const updateInstructor = createAdminFunction<
  UpdateInstructorRequest,
  UpdateInstructorResponse
>(async (data) => {
  // Check instructor exists
  const existing = await InstructorRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Instructor', data.id);
  }

  // Validate update data (merge with existing for full validation)
  const merged = { ...existing, ...data };
  const validationResult = instructorValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for duplicate email if email is being changed
  if (data.email && data.email !== existing.email) {
    const existingWithEmail = await InstructorRepository.findByEmail(data.email);
    if (existingWithEmail) {
      throw new Error(`An instructor with email ${data.email} already exists`);
    }
  }

  const instructor = await InstructorRepository.update(data);

  return { instructor };
});
