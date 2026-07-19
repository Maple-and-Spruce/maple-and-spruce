/**
 * Get Students Cloud Function
 *
 * Retrieves music lesson students, optionally filtered by status, primary
 * teacher, or Hope Scholarship flag.
 */
import {
  createRoleFunction,
  Role,
  instructorScopeForUser,
} from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import type {
  GetStudentsRequest,
  GetStudentsResponse,
} from '@maple/ts/firebase/api-types';

export const getStudents = createRoleFunction<
  GetStudentsRequest,
  GetStudentsResponse
>(async (data, context) => {
  // Lesson teachers see only their own students (read-own). Admins see all.
  const scope = await instructorScopeForUser(context);
  let primaryTeacherId = data.primaryTeacherId;
  if (!scope.isAdmin) {
    // An unlinked lesson-teacher owns no students → return an empty list.
    if (!scope.instructorId) return { students: [] };
    primaryTeacherId = scope.instructorId;
  }

  const students = await StudentRepository.findAll({
    status: data.status,
    primaryTeacherId,
    isHopeScholarship: data.isHopeScholarship,
  });

  return { students };
}, [Role.Admin, Role.LessonTeacher]);
