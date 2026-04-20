/**
 * Get Signed Agreements Cloud Function
 *
 * Retrieves signed agreements with optional filters.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { SignedAgreementRepository } from '@maple/firebase/database';
import type {
  GetSignedAgreementsRequest,
  GetSignedAgreementsResponse,
} from '@maple/ts/firebase/api-types';

export const getSignedAgreements = createAdminFunction<
  GetSignedAgreementsRequest,
  GetSignedAgreementsResponse
>(async (data) => {
  const agreements = await SignedAgreementRepository.findAll({
    signerEmail: data.signerEmail,
    templateId: data.templateId,
  });

  return { agreements };
});
