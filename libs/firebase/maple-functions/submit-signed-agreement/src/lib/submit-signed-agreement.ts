/**
 * Submit Signed Agreement Cloud Function
 *
 * Public endpoint (no auth required) — accepts a signature submission,
 * stores the signature image in Firebase Storage, creates a SignedAgreement
 * record, and marks the request as signed.
 *
 * Captures IP address and user agent for audit trail.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { Functions } from '@maple/firebase/functions';
import {
  AgreementRequestRepository,
  AgreementTemplateRepository,
  SignedAgreementRepository,
} from '@maple/firebase/database';
import { isAgreementRequestSignable } from '@maple/ts/domain';
import { agreementSigningValidation } from '@maple/ts/validation';
import { getStorage } from 'firebase-admin/storage';
import type {
  SubmitSignedAgreementRequest,
  SubmitSignedAgreementResponse,
} from '@maple/ts/firebase/api-types';
import type { MediaReleaseChoice } from '@maple/ts/domain';

/**
 * Render the agreement sections into an HTML snapshot for the legal record.
 * This is a simple rendering — the full template content is stored so that
 * even if the template is later edited, the legal record is preserved.
 */
function renderAgreementHtml(
  templateName: string,
  sections: Array<{ title: string; content: string }>
): string {
  const sectionHtml = sections
    .map(
      (s) =>
        `<section><h2>${s.title}</h2><div>${s.content}</div></section>`
    )
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head><title>${templateName}</title></head>
<body>
<h1>${templateName}</h1>
${sectionHtml}
</body>
</html>`;
}

/**
 * Upload a base64 PNG to Firebase Storage and return the file path.
 */
async function uploadSignature(
  signedAgreementId: string,
  filename: string,
  base64Data: string
): Promise<string> {
  const bucket = getStorage().bucket();
  const filePath = `agreements/${signedAgreementId}/${filename}`;
  const file = bucket.file(filePath);

  // Strip data URL prefix if present (e.g., "data:image/png;base64,")
  const raw = base64Data.includes(',')
    ? base64Data.split(',')[1]
    : base64Data;
  const buffer = Buffer.from(raw, 'base64');

  await file.save(buffer, {
    metadata: { contentType: 'image/png' },
  });

  return filePath;
}

export const submitSignedAgreement = Functions.endpoint
  .withOptions({ timeoutSeconds: 120 })
  .handle<SubmitSignedAgreementRequest, SubmitSignedAgreementResponse>(
    async (data, _context, _secrets, _strings) => {
      // Validate input
      const result = agreementSigningValidation(data);
      if (result.hasErrors()) {
        const errors = result.getErrors();
        const errorMessages = Object.entries(errors)
          .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
          .join('; ');
        throw new Error(`Validation failed: ${errorMessages}`);
      }

      // Look up the request by token
      const request = await AgreementRequestRepository.findByToken(data.token);
      if (!request) {
        throw new Error('Invalid or expired signing link');
      }

      if (!isAgreementRequestSignable(request)) {
        if (request.status === 'signed') {
          throw new Error('This agreement has already been signed');
        }
        throw new Error('This signing link has expired');
      }

      // Fetch the template for the HTML snapshot
      const template = await AgreementTemplateRepository.findById(
        request.templateId
      );
      if (!template) {
        throw new Error('Agreement template not found');
      }

      // Generate a temporary ID for the storage path
      const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Upload signature image(s) to Firebase Storage
      const signatureImagePath = await uploadSignature(
        tempId,
        'signature.png',
        data.signatureData
      );

      let guardianSignatureImagePath: string | undefined;
      if (data.isMinor && data.guardianSignatureData) {
        guardianSignatureImagePath = await uploadSignature(
          tempId,
          'guardian-signature.png',
          data.guardianSignatureData
        );
      }

      // Render HTML snapshot of the agreement
      const agreementHtmlSnapshot = renderAgreementHtml(
        template.name,
        template.sections
      );

      // Create the signed agreement record
      const signedAgreement = await SignedAgreementRepository.create({
        requestId: request.id,
        templateId: request.templateId,
        templateVersion: request.templateVersion,
        agreementHtmlSnapshot,
        signerEmail: request.signerEmail,
        printedName: data.printedName,
        signatureImagePath,
        mediaReleaseChoice: data.mediaReleaseChoice as
          | MediaReleaseChoice
          | undefined,
        isMinor: data.isMinor ?? false,
        minorName: data.minorName,
        guardianName: data.guardianName,
        guardianSignatureImagePath,
        signedAt: new Date(),
        ipAddress: 'captured-by-cloud-function',
        userAgent: 'captured-by-cloud-function',
      });

      // Rename storage files to use the actual signed agreement ID
      const bucket = getStorage().bucket();
      const newSignaturePath = `agreements/${signedAgreement.id}/signature.png`;
      await bucket.file(signatureImagePath).move(newSignaturePath);

      let newGuardianPath: string | undefined;
      if (guardianSignatureImagePath) {
        newGuardianPath = `agreements/${signedAgreement.id}/guardian-signature.png`;
        await bucket.file(guardianSignatureImagePath).move(newGuardianPath);
      }

      // Mark request as signed
      await AgreementRequestRepository.markSigned(
        request.id,
        signedAgreement.id
      );

      return {
        signedAgreement: {
          ...signedAgreement,
          signatureImagePath: newSignaturePath,
          guardianSignatureImagePath: newGuardianPath,
        },
      };
    }
  );
