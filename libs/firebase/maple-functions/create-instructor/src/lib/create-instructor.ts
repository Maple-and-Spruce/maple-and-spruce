import { Functions, Role } from '@maple/firebase/functions';
import { InstructorRepository } from '@maple/firebase/database';
import { instructorValidation } from '@maple/ts/validation';
import type {
  CreateInstructorRequest,
  CreateInstructorResponse,
} from '@maple/ts/firebase/api-types';

export const createInstructor = Functions.endpoint
  .requiringRole(Role.Admin)
  .validating(instructorValidation)
  .ensuringUnique<CreateInstructorRequest>({
    entity: 'Instructor',
    field: 'email',
    exists: async (email) =>
      (await InstructorRepository.findByEmail(email)) !== undefined,
  })
  .handle<CreateInstructorRequest, CreateInstructorResponse>(async (data) => {
    const instructor = await InstructorRepository.create(data);
    return { instructor };
  });
