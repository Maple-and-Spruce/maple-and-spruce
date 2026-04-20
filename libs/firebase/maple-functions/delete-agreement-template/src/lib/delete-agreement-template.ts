/**
 * Delete Agreement Template Cloud Function
 *
 * Soft-deletes (archives) an agreement template.
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
  DeleteAgreementTemplateRequest,
  DeleteAgreementTemplateResponse,
} from '@maple/ts/firebase/api-types';

export const deleteAgreementTemplate = createAdminFunction<
  DeleteAgreementTemplateRequest,
  DeleteAgreementTemplateResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Template ID is required');

  const existing = await AgreementTemplateRepository.findById(data.id);
  if (!existing) throwNotFound('Agreement template', data.id);

  await AgreementTemplateRepository.archive(data.id);

  return { success: true };
});
