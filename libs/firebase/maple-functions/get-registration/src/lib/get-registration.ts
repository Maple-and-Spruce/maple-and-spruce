/**
 * Get Registration Cloud Function
 *
 * Retrieves a single registration by ID.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import type {
  GetRegistrationRequest,
  GetRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const getRegistration = createAdminFunction<
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
});
