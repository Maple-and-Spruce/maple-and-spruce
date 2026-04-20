/**
 * Send Agreement Request Cloud Function
 *
 * Admin creates and sends a waiver/agreement to someone's email.
 * Used for music lesson agreements, one-off studio waivers, etc.
 * Generates a signing token and queues a signing email.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { randomBytes } from 'crypto';
import { Functions } from '@maple/firebase/functions';
import { Role } from '@maple/firebase/functions';
import {
  AgreementTemplateRepository,
  AgreementRequestRepository,
  getDb,
} from '@maple/firebase/database';
import {
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import type {
  SendAgreementRequestRequest,
  SendAgreementRequestResponse,
} from '@maple/ts/firebase/api-types';
import type { AgreementDeliveryMethod } from '@maple/ts/domain';

/** Default expiry: 30 days from now */
const DEFAULT_EXPIRY_DAYS = 30;

/**
 * Extract the first HTTPS origin from ALLOWED_ORIGINS for signing URLs.
 * Falls back to the first origin if no HTTPS origin exists.
 */
function getAppUrl(allowedOrigins: string): string {
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  const httpsOrigin = origins.find((o) => o.startsWith('https://'));
  return httpsOrigin ?? origins[0] ?? 'http://localhost:3000';
}

export const sendAgreementRequest = Functions.endpoint
  .usingStrings('ALLOWED_ORIGINS')
  .requiringRole(Role.Admin)
  .handle<SendAgreementRequestRequest, SendAgreementRequestResponse>(
    async (data, _context, _secrets, strings) => {
      if (!data.templateId) throwInvalidArgument('Template ID is required');
      if (!data.signerEmail) throwInvalidArgument('Signer email is required');
      if (!data.signerName) throwInvalidArgument('Signer name is required');

      const template = await AgreementTemplateRepository.findById(
        data.templateId
      );
      if (!template) throwNotFound('Agreement template', data.templateId);
      if (template!.status !== 'active') {
        throwInvalidArgument('Cannot send requests for archived templates');
      }

      const signingToken = randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRY_DAYS);

      const request = await AgreementRequestRepository.create({
        templateId: data.templateId,
        templateVersion: template!.version,
        signerEmail: data.signerEmail,
        signerName: data.signerName,
        signerPhone: data.signerPhone,
        deliveryMethod: (data.deliveryMethod ||
          'email') as AgreementDeliveryMethod,
        classId: data.classId,
        studentId: data.studentId,
        signingToken,
        expiresAt,
        status: 'pending',
      });

      // Build the full signing URL
      const appUrl = getAppUrl(strings.ALLOWED_ORIGINS);
      const signingUrl = `${appUrl}/sign/${signingToken}`;

      // Queue signing email
      const db = getDb();
      await db.collection('mail').add({
        to: data.signerEmail,
        template: {
          name: 'agreement-signing-request',
          data: {
            signerName: data.signerName,
            templateName: template!.name,
            signingUrl,
          },
        },
      });

      await AgreementRequestRepository.markEmailSent(request.id);

      return { request: { ...request, emailSentAt: new Date() } };
    }
  );
