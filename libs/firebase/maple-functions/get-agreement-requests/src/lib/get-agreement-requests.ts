/**
 * Get Agreement Requests Cloud Function
 *
 * Retrieves agreement requests with optional filters.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { AgreementRequestRepository } from '@maple/firebase/database';
import type {
  GetAgreementRequestsRequest,
  GetAgreementRequestsResponse,
} from '@maple/ts/firebase/api-types';

export const getAgreementRequests = createAdminFunction<
  GetAgreementRequestsRequest,
  GetAgreementRequestsResponse
>(async (data) => {
  const requests = await AgreementRequestRepository.findAll({
    status: data.status,
    signerEmail: data.signerEmail,
    classId: data.classId,
    registrationId: data.registrationId,
  });

  return { requests };
});
