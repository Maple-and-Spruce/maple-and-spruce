/**
 * Get Student Cloud Function
 *
 * Retrieves a single music lesson student by ID.
 */
import { createAuthenticatedFunction, throwNotFound } from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import type {
  GetStudentRequest,
  GetStudentResponse,
} from '@maple/ts/firebase/api-types';

export const getStudent = createAuthenticatedFunction<
  GetStudentRequest,
  GetStudentResponse
>(async (data) => {
  const student = await StudentRepository.findById(data.id);

  if (!student) {
    throwNotFound('Student', data.id);
  }

  return { student };
});
