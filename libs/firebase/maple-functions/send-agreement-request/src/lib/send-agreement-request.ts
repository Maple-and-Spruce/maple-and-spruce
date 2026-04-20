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
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  AgreementTemplateRepository,
  AgreementRequestRepository,
} from '@maple/firebase/database';
import { getDb } from '@maple/firebase/database';
import type {
  SendAgreementRequestRequest,
  SendAgreementRequestResponse,
} from '@maple/ts/firebase/api-types';
import type { AgreementDeliveryMethod } from '@maple/ts/domain';

/** Default expiry: 30 days from now */
const DEFAULT_EXPIRY_DAYS = 30;

export const sendAgreementRequest = createAdminFunction<
  SendAgreementRequestRequest,
  SendAgreementRequestResponse
>(async (data) => {
  if (!data.templateId) throwInvalidArgument('Template ID is required');
  if (!data.signerEmail) throwInvalidArgument('Signer email is required');
  if (!data.signerName) throwInvalidArgument('Signer name is required');

  const template = await AgreementTemplateRepository.findById(data.templateId);
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
    deliveryMethod: (data.deliveryMethod || 'email') as AgreementDeliveryMethod,
    classId: data.classId,
    studentId: data.studentId,
    signingToken,
    expiresAt,
    status: 'pending',
  });

  // Queue signing email
  const db = getDb();
  await db.collection('mail').add({
    to: data.signerEmail,
    template: {
      name: 'agreement-signing-request',
      data: {
        signerName: data.signerName,
        templateName: template!.name,
        signingToken,
      },
    },
  });

  await AgreementRequestRepository.markEmailSent(request.id);

  return { request: { ...request, emailSentAt: new Date() } };
});
