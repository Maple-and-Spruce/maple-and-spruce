/**
 * Get Students Cloud Function
 *
 * Retrieves music lesson students, optionally filtered by status, primary
 * teacher, or Hope Scholarship flag.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { StudentRepository } from '@maple/firebase/database';
import type {
  GetStudentsRequest,
  GetStudentsResponse,
} from '@maple/ts/firebase/api-types';

export const getStudents = createRoleFunction<
  GetStudentsRequest,
  GetStudentsResponse
>(async (data) => {
  const students = await StudentRepository.findAll({
    status: data.status,
    primaryTeacherId: data.primaryTeacherId,
    isHopeScholarship: data.isHopeScholarship,
  });

  return { students };
}, [Role.Admin, Role.LessonTeacher]);
