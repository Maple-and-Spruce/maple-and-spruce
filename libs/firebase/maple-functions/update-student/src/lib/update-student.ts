/**
 * Update Student Cloud Function
 *
 * Admin + lesson-teacher (own students only; scoped-roles epic #617).
 */
import {
  createRoleFunction,
  Role,
  throwNotFound,
  assertCanManageStudent,
} from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import { studentValidation } from '@maple/ts/validation';
import type {
  UpdateStudentRequest,
  UpdateStudentResponse,
} from '@maple/ts/firebase/api-types';

export const updateStudent = createRoleFunction<
  UpdateStudentRequest,
  UpdateStudentResponse
>(async (data, context) => {
  const existing = await StudentRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Student', data.id);
  }

  // A lesson teacher may only touch a student they teach.
  await assertCanManageStudent(context, existing.primaryTeacherId);

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
}, [Role.Admin, Role.LessonTeacher]);
