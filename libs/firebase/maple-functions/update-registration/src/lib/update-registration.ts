/**
 * Update Registration Cloud Function
 *
 * Updates an existing registration (status, notes, etc.).
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import type {
  UpdateRegistrationRequest,
  UpdateRegistrationResponse,
} from '@maple/ts/firebase/api-types';

export const updateRegistration = createAdminFunction<
  UpdateRegistrationRequest,
  UpdateRegistrationResponse
>(async (data) => {
  if (!data.id) {
    throw new Error('Registration ID is required');
  }

  // Check if registration exists
  const existing = await RegistrationRepository.findById(data.id);
  if (!existing) {
    throw new Error(`Registration not found: ${data.id}`);
  }

  const registration = await RegistrationRepository.update(data);

  return { registration };
});
