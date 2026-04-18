/**
 * Update Student Cloud Function
 *
 * Updates an existing music lesson student (admin only).
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import { studentValidation } from '@maple/ts/validation';
import type {
  UpdateStudentRequest,
  UpdateStudentResponse,
} from '@maple/ts/firebase/api-types';

export const updateStudent = createAdminFunction<
  UpdateStudentRequest,
  UpdateStudentResponse
>(async (data) => {
  const existing = await StudentRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Student', data.id);
  }

  // Merge with existing so partial updates still pass full validation
  const merged = { ...existing, ...data };
  const validationResult = studentValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const student = await StudentRepository.update(data);

  return { student };
});
