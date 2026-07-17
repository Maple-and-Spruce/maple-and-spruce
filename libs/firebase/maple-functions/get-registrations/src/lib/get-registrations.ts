/**
 * Get Registrations Cloud Function
 *
 * Retrieves registrations with optional filters (classId, status, email).
 * Admin-only endpoint for viewing registration rosters.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { RegistrationRepository } from '@maple/firebase/database';
import type {
  GetRegistrationsRequest,
  GetRegistrationsResponse,
} from '@maple/ts/firebase/api-types';

export const getRegistrations = createRoleFunction<
  GetRegistrationsRequest,
  GetRegistrationsResponse
>(async (data) => {
  const registrations = await RegistrationRepository.findAll({
    classId: data.classId,
    status: data.status,
    customerEmail: data.customerEmail,
    source: data.source,
  });

  return { registrations };
}, [Role.Admin, Role.Clerk]);
