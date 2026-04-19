import { Functions, Role } from '@maple/firebase/functions';
import { ClassRepository } from '@maple/firebase/database';
import { classValidation } from '@maple/ts/validation';
import type {
  CreateClassRequest,
  CreateClassResponse,
} from '@maple/ts/firebase/api-types';

export const createClass = Functions.endpoint
  .requiringRole(Role.Admin)
  .validating(classValidation)
  .handle<CreateClassRequest, CreateClassResponse>(async (data) => {
    const classItem = await ClassRepository.create(data);
    return { class: classItem };
  });
