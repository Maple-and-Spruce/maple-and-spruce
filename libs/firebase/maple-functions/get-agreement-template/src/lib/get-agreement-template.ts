/**
 * Get Agreement Template Cloud Function
 *
 * Retrieves a single agreement template by ID.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { AgreementTemplateRepository } from '@maple/firebase/database';
import type {
  GetAgreementTemplateRequest,
  GetAgreementTemplateResponse,
} from '@maple/ts/firebase/api-types';

export const getAgreementTemplate = createAdminFunction<
  GetAgreementTemplateRequest,
  GetAgreementTemplateResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Template ID is required');

  const template = await AgreementTemplateRepository.findById(data.id);
  if (!template) throwNotFound('Agreement template', data.id);

  return { template: template! };
});
