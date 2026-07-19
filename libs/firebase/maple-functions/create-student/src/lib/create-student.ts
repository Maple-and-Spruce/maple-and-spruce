/**
 * Create Student Cloud Function
 *
 * Creates a new music lesson student (admin only).
 */
import {
  createRoleFunction,
  Role,
  assertCanManageStudent,
} from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import { studentValidation } from '@maple/ts/validation';
import type {
  CreateStudentRequest,
  CreateStudentResponse,
} from '@maple/ts/firebase/api-types';

export const createStudent = createRoleFunction<
  CreateStudentRequest,
  CreateStudentResponse
>(async (data, context) => {
  // A lesson teacher may only create students assigned to themselves.
  await assertCanManageStudent(context, data.primaryTeacherId);

  const validationResult = studentValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const student = await StudentRepository.create(data);

  return { student };
}, [Role.Admin, Role.LessonTeacher]);
