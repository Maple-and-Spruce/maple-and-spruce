/**
 * Delete Instructor Cloud Function
 *
 * Deletes an instructor (admin only).
 * Note: Consider using updateInstructor to set status to 'inactive' instead
 * to preserve historical records.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import type {
  DeleteInstructorRequest,
  DeleteInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const deleteInstructor = createAdminFunction<
  DeleteInstructorRequest,
  DeleteInstructorResponse
>(async (data) => {
  // Check instructor exists
  const existing = await InstructorRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Instructor', data.id);
  }

  await InstructorRepository.delete(data.id);

  return { success: true };
});
