/**
 * Agreement Request domain types
 *
 * Represents a request for someone to sign an agreement.
 * Created either automatically during class registration (auto-attach)
 * or manually by admin (music lessons, one-off waivers).
 *
 * The signing token provides public access to the signing page
 * without requiring authentication (same pattern as public registration).
 */

export type AgreementRequestStatus =
  | 'pending' // Awaiting signature
  | 'signed' // Signature completed
  | 'expired' // Signing link expired
  | 'cancelled'; // Admin cancelled the request

export const AGREEMENT_REQUEST_STATUSES: AgreementRequestStatus[] = [
  'pending',
  'signed',
  'expired',
  'cancelled',
];

/**
 * How the agreement was delivered to the signer
 */
export type AgreementDeliveryMethod =
  | 'email' // Admin sent directly to email
  | 'registration' // Auto-attached during class registration
  | 'kiosk' // Signed on-premises on iPad/laptop
  | 'sms'; // Future: sent via text message

/**
 * Agreement Request entity
 */
export interface AgreementRequest {
  id: string;
  /** Template to sign */
  templateId: string;
  /** Snapshot of template version at time of request creation */
  templateVersion: number;
  /** Signer's email address */
  signerEmail: string;
  /** Signer's name */
  signerName: string;
  /** Signer's phone (for future SMS delivery) */
  signerPhone?: string;
  /** How this request was initiated */
  deliveryMethod: AgreementDeliveryMethod;
  /** Link to registration if triggered by class signup */
  registrationId?: string;
  /** Link to class if relevant */
  classId?: string;
  /** Link to student if relevant (music lessons) */
  studentId?: string;
  /** Cryptographic token for public signing URL (32-byte hex) */
  signingToken: string;
  /** When the signing link expires */
  expiresAt: Date;
  status: AgreementRequestStatus;
  /** When the signing email was sent */
  emailSentAt?: Date;
  /** ID of the resulting SignedAgreement (set when status becomes 'signed') */
  signedAgreementId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new agreement request */
export type CreateAgreementRequestInput = Omit<
  AgreementRequest,
  'id' | 'createdAt' | 'updatedAt' | 'emailSentAt' | 'signedAgreementId'
>;

/**
 * Check if a request can still be signed
 */
export function isAgreementRequestSignable(
  request: AgreementRequest
): boolean {
  return (
    request.status === 'pending' && new Date() < request.expiresAt
  );
}
