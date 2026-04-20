/**
 * Get Signed Agreement Cloud Function
 *
 * Retrieves a single signed agreement with temporary download URL for signatures.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { SignedAgreementRepository } from '@maple/firebase/database';
import { getStorage } from 'firebase-admin/storage';
import type {
  GetSignedAgreementRequest,
  GetSignedAgreementResponse,
} from '@maple/ts/firebase/api-types';

/** Signed URL expiry: 1 hour */
const SIGNED_URL_EXPIRY_MS = 60 * 60 * 1000;

export const getSignedAgreement = createAdminFunction<
  GetSignedAgreementRequest,
  GetSignedAgreementResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Agreement ID is required');

  const agreement = await SignedAgreementRepository.findById(data.id);
  if (!agreement) throwNotFound('Signed agreement', data.id);

  const bucket = getStorage().bucket();

  // Generate temporary download URL for signature image
  const [signatureUrl] = await bucket
    .file(agreement!.signatureImagePath)
    .getSignedUrl({
      action: 'read',
      expires: Date.now() + SIGNED_URL_EXPIRY_MS,
    });

  let guardianSignatureImageUrl: string | undefined;
  if (agreement!.guardianSignatureImagePath) {
    const [guardianUrl] = await bucket
      .file(agreement!.guardianSignatureImagePath)
      .getSignedUrl({
        action: 'read',
        expires: Date.now() + SIGNED_URL_EXPIRY_MS,
      });
    guardianSignatureImageUrl = guardianUrl;
  }

  return {
    agreement: agreement!,
    signatureImageUrl: signatureUrl,
    guardianSignatureImageUrl,
  };
});
