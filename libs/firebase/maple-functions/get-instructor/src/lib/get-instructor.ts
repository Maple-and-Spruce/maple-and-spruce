/**
 * Get Instructor Cloud Function
 *
 * Retrieves a single instructor by ID.
 */
import { createAuthenticatedFunction, throwNotFound } from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import type {
  GetInstructorRequest,
  GetInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const getInstructor = createAuthenticatedFunction<
  GetInstructorRequest,
  GetInstructorResponse
>(async (data) => {
  const instructor = await InstructorRepository.findById(data.id);

  if (!instructor) {
    throwNotFound('Instructor', data.id);
  }

  return { instructor };
});
