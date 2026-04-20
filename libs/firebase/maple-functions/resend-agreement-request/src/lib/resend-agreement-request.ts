/**
 * Resend Agreement Request Cloud Function
 *
 * Re-sends the signing email for a pending agreement request.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import { Role } from '@maple/firebase/functions';
import {
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  AgreementRequestRepository,
  AgreementTemplateRepository,
  getDb,
} from '@maple/firebase/database';
import type {
  ResendAgreementRequestRequest,
  ResendAgreementRequestResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Extract the first HTTPS origin from ALLOWED_ORIGINS for signing URLs.
 */
function getAppUrl(allowedOrigins: string): string {
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  const httpsOrigin = origins.find((o) => o.startsWith('https://'));
  return httpsOrigin ?? origins[0] ?? 'http://localhost:3000';
}

export const resendAgreementRequest = Functions.endpoint
  .usingStrings('ALLOWED_ORIGINS')
  .requiringRole(Role.Admin)
  .handle<ResendAgreementRequestRequest, ResendAgreementRequestResponse>(
    async (data, _context, _secrets, strings) => {
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

      // Build the full signing URL
      const appUrl = getAppUrl(strings.ALLOWED_ORIGINS);
      const signingUrl = `${appUrl}/sign/${request!.signingToken}`;

      // Queue signing email
      const db = getDb();
      await db.collection('mail').add({
        to: request!.signerEmail,
        template: {
          name: 'agreement-signing-request',
          data: {
            signerName: request!.signerName,
            templateName: template?.name ?? 'Agreement',
            signingUrl,
          },
        },
      });

      await AgreementRequestRepository.markEmailSent(request!.id);

      return { request: { ...request!, emailSentAt: new Date() } };
    }
  );
