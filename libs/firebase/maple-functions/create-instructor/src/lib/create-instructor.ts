/**
 * Create Instructor Cloud Function
 *
 * Creates a new instructor (admin only).
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import { instructorValidation } from '@maple/ts/validation';
import type {
  CreateInstructorRequest,
  CreateInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const createInstructor = createAdminFunction<
  CreateInstructorRequest,
  CreateInstructorResponse
>(async (data) => {
  // Validate input
  const validationResult = instructorValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  // Check for duplicate email
  const existingInstructor = await InstructorRepository.findByEmail(data.email);
  if (existingInstructor) {
    throw new Error(`An instructor with email ${data.email} already exists`);
  }

  const instructor = await InstructorRepository.create(data);

  return { instructor };
});
