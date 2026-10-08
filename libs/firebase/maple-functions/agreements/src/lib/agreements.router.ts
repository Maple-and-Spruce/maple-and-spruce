/**
 * agreements — the staff side of agreements and waivers, as one Cloud Function
 * (ADR-029, #66): templates, the signing requests sent from them, and the
 * agreements people have signed. Every route is admin-only.
 *
 * Four agreement functions deliberately stay their own:
 * - `getAgreementForSigning` and `submitSignedAgreement` are the public
 *   `/sign/[token]` page. Public routes would share an instance with these
 *   admin ones, and the submit takes a signature upload with a 120s timeout.
 * - `getRequiredAgreementsForClass` is called by the Webflow registration
 *   widget (moving it needs a Webflow publish), keeps a warm instance in prod,
 *   and the widget swallows its errors, so a broken call would silently drop
 *   required waivers from checkout.
 * - `expireAgreementRequests` is a scheduled job, which a route cannot be.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import { randomBytes } from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import {
  Functions,
  Role,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import {
  AgreementRequestRepository,
  AgreementTemplateRepository,
  SignedAgreementRepository,
  getDb,
} from '@maple/firebase/database';
import type { AgreementDeliveryMethod } from '@maple/ts/domain';
import { agreementTemplateValidation } from '@maple/ts/validation';
import type {
  CreateAgreementTemplateRequest,
  CreateAgreementTemplateResponse,
  DeleteAgreementTemplateRequest,
  DeleteAgreementTemplateResponse,
  GetAgreementRequestsRequest,
  GetAgreementRequestsResponse,
  GetAgreementTemplateRequest,
  GetAgreementTemplateResponse,
  GetAgreementTemplatesRequest,
  GetAgreementTemplatesResponse,
  GetSignedAgreementRequest,
  GetSignedAgreementResponse,
  GetSignedAgreementsRequest,
  GetSignedAgreementsResponse,
  ResendAgreementRequestRequest,
  ResendAgreementRequestResponse,
  SendAgreementRequestRequest,
  SendAgreementRequestResponse,
  UpdateAgreementTemplateRequest,
  UpdateAgreementTemplateResponse,
} from '@maple/ts/firebase/api-types';

/** A new signing request expires 30 days after it is sent. */
const DEFAULT_EXPIRY_DAYS = 30;

/** Signed URLs for signature images last an hour. */
const SIGNED_URL_EXPIRY_MS = 60 * 60 * 1000;

/**
 * The app origin for signing links: the first HTTPS origin in
 * ALLOWED_ORIGINS, falling back to the first origin.
 */
export function getAppUrl(allowedOrigins: string): string {
  const origins = allowedOrigins.split(',').map((o) => o.trim());
  const httpsOrigin = origins.find((o) => o.startsWith('https://'));
  return httpsOrigin ?? origins[0] ?? 'http://localhost:3000';
}

/** Queue the signing email; the Trigger Email extension sends it. */
async function queueSigningEmail(
  to: string,
  signerName: string,
  templateName: string,
  signingUrl: string,
): Promise<void> {
  await getDb()
    .collection('mail')
    .add({
      to,
      template: {
        name: 'agreement-signing-request',
        data: { signerName, templateName, signingUrl },
      },
    });
}

async function signedUrl(path: string): Promise<string> {
  const [url] = await getStorage()
    .bucket()
    .file(path)
    .getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    });
  return url;
}

export const agreements = Functions.router('agreements', {
  getAgreementTemplates: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetAgreementTemplatesRequest, GetAgreementTemplatesResponse>(
      async (data) => {
        const templates = await AgreementTemplateRepository.findAll({
          status: data.status,
        });
        return { templates };
      },
    ),

  getAgreementTemplate: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetAgreementTemplateRequest, GetAgreementTemplateResponse>(
      async (data) => {
        if (!data.id) throwInvalidArgument('Template ID is required');
        const template = await AgreementTemplateRepository.findById(data.id);
        if (!template) throwNotFound('Agreement template', data.id);
        return { template };
      },
    ),

  createAgreementTemplate: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<CreateAgreementTemplateRequest, CreateAgreementTemplateResponse>(
      async (data) => {
        const result = agreementTemplateValidation(data);
        if (result.hasErrors()) throwValidationError(result.getErrors());
        const template = await AgreementTemplateRepository.create(data);
        return { template };
      },
    ),

  /** Validates only the changed fields, against the merged record. Bumps the version. */
  updateAgreementTemplate: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<UpdateAgreementTemplateRequest, UpdateAgreementTemplateResponse>(
      async (data) => {
        if (!data.id) throwInvalidArgument('Template ID is required');
        const existing = await AgreementTemplateRepository.findById(data.id);
        if (!existing) throwNotFound('Agreement template', data.id);

        const fields = Object.keys(data).filter((key) => key !== 'id');
        if (fields.length > 0) {
          const result = agreementTemplateValidation(
            { ...existing, ...data },
            fields,
          );
          if (result.hasErrors()) throwValidationError(result.getErrors());
        }

        const template = await AgreementTemplateRepository.update(data);
        return { template };
      },
    ),

  /** Archives rather than deletes: signed agreements still point at the template. */
  deleteAgreementTemplate: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<DeleteAgreementTemplateRequest, DeleteAgreementTemplateResponse>(
      async (data) => {
        if (!data.id) throwInvalidArgument('Template ID is required');
        const existing = await AgreementTemplateRepository.findById(data.id);
        if (!existing) throwNotFound('Agreement template', data.id);
        await AgreementTemplateRepository.archive(data.id);
        return { success: true };
      },
    ),

  getAgreementRequests: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetAgreementRequestsRequest, GetAgreementRequestsResponse>(
      async (data) => {
        const requests = await AgreementRequestRepository.findAll({
          status: data.status,
          signerEmail: data.signerEmail,
          classId: data.classId,
          registrationId: data.registrationId,
        });
        return { requests };
      },
    ),

  /**
   * Send an agreement to someone by email (music lessons, one-off studio
   * waivers): creates the request with a signing token and queues the email.
   */
  sendAgreementRequest: Functions.endpoint
    .usingStrings('ALLOWED_ORIGINS')
    .requiringRole(Role.Admin)
    .asRoute<SendAgreementRequestRequest, SendAgreementRequestResponse>(
      async (data, _context, _secrets, strings) => {
        if (!data.templateId) throwInvalidArgument('Template ID is required');
        if (!data.signerEmail) throwInvalidArgument('Signer email is required');
        if (!data.signerName) throwInvalidArgument('Signer name is required');

        const template = await AgreementTemplateRepository.findById(
          data.templateId,
        );
        if (!template) throwNotFound('Agreement template', data.templateId);
        if (template.status !== 'active') {
          throwInvalidArgument('Cannot send requests for archived templates');
        }

        const signingToken = randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + DEFAULT_EXPIRY_DAYS);

        const request = await AgreementRequestRepository.create({
          templateId: data.templateId,
          templateVersion: template.version,
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

        const signingUrl = `${getAppUrl(strings.ALLOWED_ORIGINS)}/sign/${signingToken}`;
        await queueSigningEmail(
          data.signerEmail,
          data.signerName,
          template.name,
          signingUrl,
        );
        await AgreementRequestRepository.markEmailSent(request.id);

        return { request: { ...request, emailSentAt: new Date() } };
      },
    ),

  /** Re-send the signing email for a request that is still pending and unexpired. */
  resendAgreementRequest: Functions.endpoint
    .usingStrings('ALLOWED_ORIGINS')
    .requiringRole(Role.Admin)
    .asRoute<ResendAgreementRequestRequest, ResendAgreementRequestResponse>(
      async (data, _context, _secrets, strings) => {
        if (!data.id) throwInvalidArgument('Request ID is required');

        const request = await AgreementRequestRepository.findById(data.id);
        if (!request) throwNotFound('Agreement request', data.id);
        if (request.status !== 'pending') {
          throwInvalidArgument('Can only resend emails for pending requests');
        }
        if (new Date() >= request.expiresAt) {
          throwInvalidArgument('This signing request has expired');
        }

        const template = await AgreementTemplateRepository.findById(
          request.templateId,
        );
        const signingUrl = `${getAppUrl(strings.ALLOWED_ORIGINS)}/sign/${request.signingToken}`;
        await queueSigningEmail(
          request.signerEmail,
          request.signerName,
          template?.name ?? 'Agreement',
          signingUrl,
        );
        await AgreementRequestRepository.markEmailSent(request.id);

        return { request: { ...request, emailSentAt: new Date() } };
      },
    ),

  getSignedAgreements: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetSignedAgreementsRequest, GetSignedAgreementsResponse>(
      async (data) => {
        const agreements = await SignedAgreementRepository.findAll({
          signerEmail: data.signerEmail,
          templateId: data.templateId,
        });
        return { agreements };
      },
    ),

  /** One signed agreement, with hour-long download URLs for its signature images. */
  getSignedAgreement: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetSignedAgreementRequest, GetSignedAgreementResponse>(
      async (data) => {
        if (!data.id) throwInvalidArgument('Agreement ID is required');
        const agreement = await SignedAgreementRepository.findById(data.id);
        if (!agreement) throwNotFound('Signed agreement', data.id);

        return {
          agreement,
          signatureImageUrl: await signedUrl(agreement.signatureImagePath),
          guardianSignatureImageUrl: agreement.guardianSignatureImagePath
            ? await signedUrl(agreement.guardianSignatureImagePath)
            : undefined,
        };
      },
    ),
});
