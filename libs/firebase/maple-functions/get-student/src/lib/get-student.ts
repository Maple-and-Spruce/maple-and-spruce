/**
 * Get Student Cloud Function
 *
 * Retrieves a single music lesson student by ID.
 */
import {
  createRoleFunction,
  Role,
  throwNotFound,
  assertOwnsAsInstructor,
} from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import type {
  GetStudentRequest,
  GetStudentResponse,
} from '@maple/ts/firebase/api-types';

// Admin + lesson-teacher, matching getStudents — a student record is child
// PII and must not be readable by any signed-in user. A lesson-teacher may
// only read their OWN students (read-own, matching the list scoping).
export const getStudent = createRoleFunction<
  GetStudentRequest,
  GetStudentResponse
>(async (data, context) => {
  const student = await StudentRepository.findById(data.id);

  if (!student) {
    throwNotFound('Student', data.id);
  }

  await assertOwnsAsInstructor(
    context,
    student.primaryTeacherId,
    'You can only view your own students.'
  );

  return { student };
}, [Role.Admin, Role.LessonTeacher]);
