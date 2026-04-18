/**
 * Delete Student Cloud Function
 *
 * Deletes a music lesson student (admin only).
 * Note: Consider using updateStudent to set status to 'inactive' instead,
 * to preserve lesson and invoice history tied to the student.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import type {
  DeleteStudentRequest,
  DeleteStudentResponse,
} from '@maple/ts/firebase/api-types';

export const deleteStudent = createAdminFunction<
  DeleteStudentRequest,
  DeleteStudentResponse
>(async (data) => {
  const existing = await StudentRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Student', data.id);
  }

  await StudentRepository.delete(data.id);

  return { success: true };
});
