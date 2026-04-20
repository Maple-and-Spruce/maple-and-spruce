/**
 * Create Agreement Template Cloud Function
 *
 * Creates a new agreement/waiver template with sections.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwValidationError,
} from '@maple/firebase/functions';
import { AgreementTemplateRepository } from '@maple/firebase/database';
import { agreementTemplateValidation } from '@maple/ts/validation';
import type {
  CreateAgreementTemplateRequest,
  CreateAgreementTemplateResponse,
} from '@maple/ts/firebase/api-types';

export const createAgreementTemplate = createAdminFunction<
  CreateAgreementTemplateRequest,
  CreateAgreementTemplateResponse
>(async (data) => {
  const result = agreementTemplateValidation(data);
  if (result.hasErrors()) {
    throwValidationError(result.getErrors());
  }

  const template = await AgreementTemplateRepository.create(data);

  return { template };
});
