/**
 * Update Registration Cloud Function
 *
 * Updates an existing registration (status, notes, etc.).
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
  Role,
} from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import { registrationValidation } from '@maple/ts/validation';
import type {
  UpdateRegistrationRequest,
  UpdateRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const updateRegistration = createRoleFunction<
  UpdateRegistrationRequest,
  UpdateRegistrationResponse
>(async (data) => {
  if (!data.id) {
    throwInvalidArgument('Registration ID is required');
  }

  const existing = await RegistrationRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Registration', data.id);
  }

  const fields = Object.keys(data).filter((key) => key !== 'id');
  if (fields.length > 0) {
    const result = registrationValidation(
      { ...existing, ...data },
      fields
    );
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  const registration = await RegistrationRepository.update(data);

  return { registration };
}, [Role.Admin, Role.Clerk]);
