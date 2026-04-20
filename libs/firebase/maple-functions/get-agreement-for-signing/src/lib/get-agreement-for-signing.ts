/**
 * Get Agreement for Signing Cloud Function
 *
 * Public endpoint (no auth required) — returns agreement content
 * for a given signing token. Used by the public signing page.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createPublicFunction } from '@maple/firebase/functions';
import {
  AgreementRequestRepository,
  AgreementTemplateRepository,
  ClassRepository,
} from '@maple/firebase/database';
import { isAgreementRequestSignable } from '@maple/ts/domain';
import type {
  GetAgreementForSigningRequest,
  GetAgreementForSigningResponse,
} from '@maple/ts/firebase/api-types';

export const getAgreementForSigning = createPublicFunction<
  GetAgreementForSigningRequest,
  GetAgreementForSigningResponse
>(async (data) => {
  if (!data.token) {
    throw new Error('Signing token is required');
  }

  const request = await AgreementRequestRepository.findByToken(data.token);
  if (!request) {
    throw new Error('Invalid or expired signing link');
  }

  if (!isAgreementRequestSignable(request)) {
    if (request.status === 'signed') {
      throw new Error('This agreement has already been signed');
    }
    if (request.status === 'cancelled') {
      throw new Error('This signing request has been cancelled');
    }
    throw new Error('This signing link has expired');
  }

  const template = await AgreementTemplateRepository.findById(
    request.templateId
  );
  if (!template) {
    throw new Error('Agreement template not found');
  }

  // Optionally fetch class name for context display
  let className: string | undefined;
  if (request.classId) {
    const classEntity = await ClassRepository.findById(request.classId);
    className = classEntity?.name;
  }

  return {
    templateName: template.name,
    sections: template.sections,
    supportsMinor: template.supportsMinor,
    signerName: request.signerName,
    signerEmail: request.signerEmail,
    className,
  };
});
