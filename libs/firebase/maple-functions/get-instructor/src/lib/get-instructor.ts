/**
 * Get Instructor Cloud Function
 *
 * Retrieves a single instructor by ID.
 */
import {
  createRoleFunction,
  hasRole,
  throwNotFound,
  Role,
} from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import { withoutContractorReadiness } from '@maple/ts/domain';
import type {
  GetInstructorRequest,
  GetInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const getInstructor = createRoleFunction<
  GetInstructorRequest,
  GetInstructorResponse
>(async (data, context) => {
  const [instructor, isAdmin] = await Promise.all([
    InstructorRepository.findById(data.id),
    context.uid ? hasRole(context.uid, Role.Admin) : Promise.resolve(false),
  ]);

  if (!instructor) {
    throwNotFound('Instructor', data.id);
  }

  // Contractor onboarding is admin-only (see getInstructors).
  return {
    instructor: isAdmin ? instructor : withoutContractorReadiness(instructor),
  };
}, [Role.Admin, Role.LessonTeacher]);
