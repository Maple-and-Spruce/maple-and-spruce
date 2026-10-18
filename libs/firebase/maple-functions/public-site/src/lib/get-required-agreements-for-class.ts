/**
 * Get Required Agreements for Class Cloud Function
 *
 * Public endpoint (no auth required) — returns template content
 * for required-at-checkout agreements matching a class's category.
 * Used by the Webflow registration widget to show inline signing.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  ClassRepository,
  AgreementTemplateRepository,
} from '@maple/firebase/database';
import type {
  GetRequiredAgreementsForClassRequest,
  GetRequiredAgreementsForClassResponse,
} from '@maple/ts/firebase/api-types';

export async function getRequiredAgreementsForClass(
  data: GetRequiredAgreementsForClassRequest,
): Promise<GetRequiredAgreementsForClassResponse> {
  if (!data.classId) {
    throw new Error('Class ID is required');
  }

  const classEntity = await ClassRepository.findById(data.classId);
  if (!classEntity) {
    throw new Error(`Class not found: ${data.classId}`);
  }

  if (!classEntity.categoryId) {
    return { agreements: [] };
  }

  const templates = await AgreementTemplateRepository.findRequiredForCategory(
    classEntity.categoryId,
  );

  return {
    agreements: templates.map((template) => ({
      templateId: template.id,
      templateName: template.name,
      sections: template.sections,
      supportsMinor: template.supportsMinor,
    })),
  };
}
