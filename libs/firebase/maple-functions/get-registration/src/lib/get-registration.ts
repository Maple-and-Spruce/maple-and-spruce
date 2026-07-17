/**
 * Get Registration Cloud Function
 *
 * Retrieves a single registration by ID.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import type {
  GetRegistrationRequest,
  GetRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const getRegistration = createRoleFunction<
  GetRegistrationRequest,
  GetRegistrationResponse
>(async (data) => {
  if (!data.id) {
    throw new Error('Registration ID is required');
  }

  const registration = await RegistrationRepository.findById(data.id);
  if (!registration) {
    throw new Error(`Registration not found: ${data.id}`);
  }

  return { registration };
}, [Role.Admin, Role.Clerk]);
