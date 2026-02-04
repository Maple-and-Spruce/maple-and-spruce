/**
 * Get Registrations Cloud Function
 *
 * Retrieves registrations with optional filters (classId, status, email).
 * Admin-only endpoint for viewing registration rosters.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import type {
  GetRegistrationsRequest,
  GetRegistrationsResponse,
} from '@maple/ts/firebase/api-types';

export const getRegistrations = createAdminFunction<
  GetRegistrationsRequest,
  GetRegistrationsResponse
>(async (data) => {
  const registrations = await RegistrationRepository.findAll({
    classId: data.classId,
    status: data.status,
    customerEmail: data.customerEmail,
  });

  return { registrations };
});
