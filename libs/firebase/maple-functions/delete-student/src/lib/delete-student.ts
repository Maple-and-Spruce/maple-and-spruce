/**
 * Delete Student Cloud Function
 *
 * Deletes a music lesson student (admin only).
 * Note: Consider using updateStudent to set status to 'inactive' instead,
 * to preserve lesson and invoice history tied to the student.
 */
import {
  createRoleFunction,
  Role,
  throwNotFound,
  assertCanManageStudent,
} from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import type {
  DeleteStudentRequest,
  DeleteStudentResponse,
} from '@maple/ts/firebase/api-types';

export const deleteStudent = createRoleFunction<
  DeleteStudentRequest,
  DeleteStudentResponse
>(async (data, context) => {
  const existing = await StudentRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Student', data.id);
  }

  await assertCanManageStudent(context, existing.primaryTeacherId);

  await StudentRepository.delete(data.id);

  return { success: true };
}, [Role.Admin, Role.LessonTeacher]);
