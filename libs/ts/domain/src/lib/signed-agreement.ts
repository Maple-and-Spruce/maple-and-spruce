/**
 * Signed Agreement domain types
 *
 * The completed, immutable legal record of a signed waiver/agreement.
 * Stores a full HTML snapshot of what the signer saw at signing time
 * so the record remains valid even if the template is later edited.
 *
 * Signature images are stored in Firebase Storage and referenced
 * by path; they are not publicly accessible.
 */

import type { MediaReleaseChoice } from './agreement-template';

/**
 * Signed Agreement entity — immutable once created
 */
export interface SignedAgreement {
  id: string;
  /** The request this signature fulfills */
  requestId: string;
  /** Template that was signed */
  templateId: string;
  /** Template version at signing time */
  templateVersion: number;
  /** Full HTML snapshot of the agreement as displayed at signing time */
  agreementHtmlSnapshot: string;
  /** Signer's email */
  signerEmail: string;
  /** Printed name as entered by signer in the signature form */
  printedName: string;
  /** Firebase Storage path to signature image (e.g., agreements/{id}/signature.png) */
  signatureImagePath: string;
  /** Response to the media release section, if the template includes one */
  mediaReleaseChoice?: MediaReleaseChoice;
  /** Whether a minor was involved */
  isMinor: boolean;
  /** Minor's name (when isMinor is true) */
  minorName?: string;
  /** Parent/guardian name (when isMinor is true) */
  guardianName?: string;
  /** Firebase Storage path to guardian's signature image */
  guardianSignatureImagePath?: string;
  /** When the agreement was signed */
  signedAt: Date;
  /** Signer's IP address for audit trail */
  ipAddress: string;
  /** Signer's browser user agent for audit trail */
  userAgent: string;
  createdAt: Date;
}

/** Input for creating a signed agreement record */
export type CreateSignedAgreementInput = Omit<
  SignedAgreement,
  'id' | 'createdAt'
>;
