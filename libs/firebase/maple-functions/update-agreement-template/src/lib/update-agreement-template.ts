/**
 * Update Agreement Template Cloud Function
 *
 * Updates an existing agreement template. Bumps version automatically.
 * Admin-only endpoint.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
  throwNotFound,
  throwValidationError,
} from '@maple/firebase/functions';
import { AgreementTemplateRepository } from '@maple/firebase/database';
import { agreementTemplateValidation } from '@maple/ts/validation';
import type {
  UpdateAgreementTemplateRequest,
  UpdateAgreementTemplateResponse,
} from '@maple/ts/firebase/api-types';

export const updateAgreementTemplate = createAdminFunction<
  UpdateAgreementTemplateRequest,
  UpdateAgreementTemplateResponse
>(async (data) => {
  if (!data.id) throwInvalidArgument('Template ID is required');

  const existing = await AgreementTemplateRepository.findById(data.id);
  if (!existing) throwNotFound('Agreement template', data.id);

  // Validate changed fields using the merged data
  const fields = Object.keys(data).filter((key) => key !== 'id');
  if (fields.length > 0) {
    const result = agreementTemplateValidation(
      { ...existing, ...data },
      fields
    );
    if (result.hasErrors()) {
      throwValidationError(result.getErrors());
    }
  }

  const template = await AgreementTemplateRepository.update(data);

  return { template };
});
