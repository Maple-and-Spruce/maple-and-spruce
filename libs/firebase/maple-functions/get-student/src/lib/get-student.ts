/**
 * Get Student Cloud Function
 *
 * Retrieves a single music lesson student by ID.
 */
import {
  createRoleFunction,
  Role,
  throwNotFound,
} from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import type {
  GetStudentRequest,
  GetStudentResponse,
} from '@maple/ts/firebase/api-types';

// Admin + lesson-teacher, matching getStudents — a student record is child
// PII and must not be readable by any signed-in user. Was auth-only before
// the analyzer (#620) caught the singular endpoint #633 missed.
export const getStudent = createRoleFunction<
  GetStudentRequest,
  GetStudentResponse
>(async (data) => {
  const student = await StudentRepository.findById(data.id);

  if (!student) {
    throwNotFound('Student', data.id);
  }

  return { student };
}, [Role.Admin, Role.LessonTeacher]);
