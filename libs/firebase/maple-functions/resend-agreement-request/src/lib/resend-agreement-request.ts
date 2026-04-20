/**
 * Resend Agreement Request Cloud Function
 *
 * Re-sends the signing email for a pending agreement request.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  AgreementRequestRepository,
  AgreementTemplateRepository,
} from '@maple/firebase/database';
import { getDb } from '@maple/firebase/database';
import type {
  ResendAgreementRequestRequest,
  ResendAgreementRequestResponse,
} from '@maple/ts/firebase/api-types';

export const resendAgreementRequest = createAdminFunction<
  ResendAgreementRequestRequest,
  ResendAgreementRequestResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Request ID is required');

  const request = await AgreementRequestRepository.findById(data.id);
  if (!request) throwNotFound('Agreement request', data.id);

  if (request!.status !== 'pending') {
    throwInvalidArgument('Can only resend emails for pending requests');
  }

  if (new Date() >= request!.expiresAt) {
    throwInvalidArgument('This signing request has expired');
  }

  const template = await AgreementTemplateRepository.findById(
    request!.templateId
  );

  // Queue signing email
  const db = getDb();
  await db.collection('mail').add({
    to: request!.signerEmail,
    template: {
      name: 'agreement-signing-request',
      data: {
        signerName: request!.signerName,
        templateName: template?.name ?? 'Agreement',
        signingToken: request!.signingToken,
      },
    },
  });

  await AgreementRequestRepository.markEmailSent(request!.id);

  return { request: { ...request!, emailSentAt: new Date() } };
});
