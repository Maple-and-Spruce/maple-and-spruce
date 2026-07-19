/**
 * Shared inline-agreement processing.
 *
 * A class category can require agreements to be signed at checkout. Both
 * payment paths collect those signatures in the widget and must persist them
 * identically:
 *  - `createRegistration` (inline card) processes them after payment, and
 *  - `createRegistrationCheckoutLink` (hosted-checkout fallback) processes them
 *    at reservation time — the signatures are captured before the buyer is
 *    redirected to Square, so that's the only point at which they're in hand.
 *
 * For each signed agreement this uploads the signature image(s), creates the
 * AgreementRequest + SignedAgreement records (the legal snapshot), moves the
 * images under the real signed-agreement id, and marks the request signed.
 */
import { getStorage } from 'firebase-admin/storage';
import { randomBytes } from 'crypto';
import {
  AgreementRequestRepository,
  SignedAgreementRepository,
} from '@maple/firebase/database';
import type { AgreementTemplate, MediaReleaseChoice } from '@maple/ts/domain';
import type { InlineAgreementSigningData } from '@maple/ts/firebase/api-types';

/** Who signed — carried onto the agreement/request records. */
export interface InlineAgreementSigner {
  email: string;
  name: string;
  phone?: string;
}

/** Upload a base64 PNG to Firebase Storage and return the file path. */
async function uploadSignature(
  signedAgreementId: string,
  filename: string,
  base64Data: string
): Promise<string> {
  const bucket = getStorage().bucket();
  const filePath = `agreements/${signedAgreementId}/${filename}`;
  const file = bucket.file(filePath);

  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
  const buffer = Buffer.from(raw, 'base64');

  await file.save(buffer, { metadata: { contentType: 'image/png' } });
  return filePath;
}

/** Render agreement sections into an HTML snapshot for the legal record. */
function renderAgreementHtml(
  templateName: string,
  sections: Array<{ title: string; content: string }>
): string {
  const sectionHtml = sections
    .map((s) => `<section><h2>${s.title}</h2><div>${s.content}</div></section>`)
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
 * Persist the signatures for a registration's required agreements. Returns
 * whether any agreements were processed (i.e. the registration is fully signed).
 * Agreements not matching a required template are ignored.
 *
 * Callers should wrap this in try/catch: a failure here must not fail a paid
 * registration — the money is taken / the spot reserved either way; a missing
 * agreement record is a follow-up, not a checkout blocker.
 */
export async function processInlineAgreements(args: {
  registrationId: string;
  classId: string;
  requiredTemplates: AgreementTemplate[];
  agreements: InlineAgreementSigningData[] | undefined;
  signer: InlineAgreementSigner;
}): Promise<boolean> {
  const { registrationId, classId, requiredTemplates, agreements, signer } =
    args;
  if (requiredTemplates.length === 0 || !agreements) return false;

  const templateMap = new Map(requiredTemplates.map((t) => [t.id, t]));

  for (const agreementData of agreements) {
    const template = templateMap.get(agreementData.templateId);
    if (!template) continue;

    const tempId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const signatureImagePath = await uploadSignature(
      tempId,
      'signature.png',
      agreementData.signatureData
    );

    let guardianSignatureImagePath: string | undefined;
    if (agreementData.isMinor && agreementData.guardianSignatureData) {
      guardianSignatureImagePath = await uploadSignature(
        tempId,
        'guardian-signature.png',
        agreementData.guardianSignatureData
      );
    }

    const signingToken = randomBytes(32).toString('hex');
    const request = await AgreementRequestRepository.create({
      templateId: template.id,
      templateVersion: template.version,
      signerEmail: signer.email,
      signerName: signer.name,
      signerPhone: signer.phone,
      deliveryMethod: 'registration',
      registrationId,
      classId,
      signingToken,
      expiresAt: new Date(), // Already signed, expiry irrelevant
      status: 'pending', // Marked signed immediately below
    });

    const agreementHtmlSnapshot = renderAgreementHtml(
      template.name,
      template.sections
    );

    const signedAgreement = await SignedAgreementRepository.create({
      requestId: request.id,
      templateId: template.id,
      templateVersion: template.version,
      agreementHtmlSnapshot,
      signerEmail: signer.email,
      printedName: agreementData.printedName.trim(),
      signatureImagePath,
      mediaReleaseChoice: agreementData.mediaReleaseChoice as
        | MediaReleaseChoice
        | undefined,
      isMinor: agreementData.isMinor ?? false,
      minorName: agreementData.minorName,
      guardianName: agreementData.guardianName,
      guardianSignatureImagePath,
      signedAt: new Date(),
      ipAddress: 'inline-checkout',
      userAgent: 'inline-checkout',
    });

    // Move the images under the real signed-agreement id.
    const bucket = getStorage().bucket();
    await bucket
      .file(signatureImagePath)
      .move(`agreements/${signedAgreement.id}/signature.png`);
    if (guardianSignatureImagePath) {
      await bucket
        .file(guardianSignatureImagePath)
        .move(`agreements/${signedAgreement.id}/guardian-signature.png`);
    }

    await AgreementRequestRepository.markSigned(request.id, signedAgreement.id);
  }

  return true;
}
