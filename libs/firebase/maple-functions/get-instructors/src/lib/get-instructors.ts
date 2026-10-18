/**
 * Get Instructors Cloud Function
 *
 * Retrieves all instructors, optionally filtered by status.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  hasRole,
  Role,
} from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import { withoutContractorReadiness } from '@maple/ts/domain';
import type {
  GetInstructorsRequest,
  GetInstructorsResponse,
} from '@maple/ts/firebase/api-types';

export const getInstructors = createRoleFunction<
  GetInstructorsRequest,
  GetInstructorsResponse
>(async (data, context) => {
  const [instructors, isAdmin] = await Promise.all([
    InstructorRepository.findAll({ status: data.status }),
    context.uid ? hasRole(context.uid, Role.Admin) : Promise.resolve(false),
  ]);

  // Contractor onboarding (background check, tax setup) is admin-only; a
  // lesson teacher listing colleagues does not see it.
  return {
    instructors: isAdmin
      ? instructors
      : instructors.map(withoutContractorReadiness),
  };
}, [Role.Admin, Role.LessonTeacher]);
