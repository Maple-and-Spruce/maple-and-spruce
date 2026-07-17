/**
 * Get Instructors Cloud Function
 *
 * Retrieves all instructors, optionally filtered by status.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import type {
  GetInstructorsRequest,
  GetInstructorsResponse,
} from '@maple/ts/firebase/api-types';

export const getInstructors = createRoleFunction<
  GetInstructorsRequest,
  GetInstructorsResponse
>(async (data) => {
  const instructors = await InstructorRepository.findAll({
    status: data.status,
  });

  return { instructors };
}, [Role.Admin, Role.LessonTeacher]);
