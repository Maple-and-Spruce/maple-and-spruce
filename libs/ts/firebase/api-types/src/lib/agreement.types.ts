/**
 * Agreement API request/response types
 *
 * Types for Firebase Cloud Function calls related to waivers and agreements.
 * Shared between client and server for type-safe API calls.
 */
import type {
  AgreementTemplate,
  AgreementTemplateStatus,
  AgreementRequest,
  AgreementRequestStatus,
  AgreementDeliveryMethod,
  SignedAgreement,
  MediaReleaseChoice,
  AgreementSection,
} from '@maple/ts/domain';

// ============================================================================
// Agreement Template CRUD (Admin)
// ============================================================================

export interface GetAgreementTemplatesRequest {
  status?: AgreementTemplateStatus;
}

export interface GetAgreementTemplatesResponse {
  templates: AgreementTemplate[];
}

export interface GetAgreementTemplateRequest {
  id: string;
}

export interface GetAgreementTemplateResponse {
  template: AgreementTemplate;
}

export interface CreateAgreementTemplateRequest {
  name: string;
  description?: string;
  sections: AgreementSection[];
  classCategoryIds: string[];
  autoAttach: boolean;
  supportsMinor: boolean;
}

export interface CreateAgreementTemplateResponse {
  template: AgreementTemplate;
}

export interface UpdateAgreementTemplateRequest {
  id: string;
  name?: string;
  description?: string;
  sections?: AgreementSection[];
  classCategoryIds?: string[];
  autoAttach?: boolean;
  supportsMinor?: boolean;
  status?: AgreementTemplateStatus;
}

export interface UpdateAgreementTemplateResponse {
  template: AgreementTemplate;
}

export interface DeleteAgreementTemplateRequest {
  id: string;
}

export interface DeleteAgreementTemplateResponse {
  success: boolean;
}

// ============================================================================
// Agreement Requests (Admin)
// ============================================================================

export interface GetAgreementRequestsRequest {
  status?: AgreementRequestStatus;
  signerEmail?: string;
  classId?: string;
  registrationId?: string;
}

export interface GetAgreementRequestsResponse {
  requests: AgreementRequest[];
}

export interface SendAgreementRequestRequest {
  templateId: string;
  signerEmail: string;
  signerName: string;
  signerPhone?: string;
  deliveryMethod: AgreementDeliveryMethod;
  /** Optional context links */
  classId?: string;
  studentId?: string;
}

export interface SendAgreementRequestResponse {
  request: AgreementRequest;
}

export interface ResendAgreementRequestRequest {
  id: string;
}

export interface ResendAgreementRequestResponse {
  request: AgreementRequest;
}

// ============================================================================
// Signed Agreements (Admin)
// ============================================================================

export interface GetSignedAgreementsRequest {
  signerEmail?: string;
  templateId?: string;
}

export interface GetSignedAgreementsResponse {
  agreements: SignedAgreement[];
}

export interface GetSignedAgreementRequest {
  id: string;
}

export interface GetSignedAgreementResponse {
  agreement: SignedAgreement;
  /** Signed download URL for the signature image (temporary) */
  signatureImageUrl: string;
  /** Signed download URL for guardian signature, if present */
  guardianSignatureImageUrl?: string;
}

// ============================================================================
// Public Signing (Token-based, no auth)
// ============================================================================

export interface GetAgreementForSigningRequest {
  token: string;
}

export interface GetAgreementForSigningResponse {
  /** Template content to render */
  templateName: string;
  sections: AgreementSection[];
  supportsMinor: boolean;
  /** Signer info pre-filled from the request */
  signerName: string;
  signerEmail: string;
  /** Context for display */
  className?: string;
}

export interface SubmitSignedAgreementRequest {
  token: string;
  /** Base64-encoded PNG of the signature canvas */
  signatureData: string;
  printedName: string;
  /** Section responses (keyed by section id) */
  mediaReleaseChoice?: MediaReleaseChoice;
  /** Minor fields */
  isMinor: boolean;
  minorName?: string;
  guardianName?: string;
  /** Base64-encoded PNG of guardian signature */
  guardianSignatureData?: string;
}

export interface SubmitSignedAgreementResponse {
  signedAgreement: SignedAgreement;
}
