/**
 * Get Agreement Templates Cloud Function
 *
 * Retrieves all agreement templates with optional status filter.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { AgreementTemplateRepository } from '@maple/firebase/database';
import type {
  GetAgreementTemplatesRequest,
  GetAgreementTemplatesResponse,
} from '@maple/ts/firebase/api-types';

export const getAgreementTemplates = createAdminFunction<
  GetAgreementTemplatesRequest,
  GetAgreementTemplatesResponse
>(async (data) => {
  const templates = await AgreementTemplateRepository.findAll({
    status: data.status,
  });

  return { templates };
});
