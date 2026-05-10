/**
 * Registration API request/response types
 *
 * Types for Firebase Cloud Function calls related to class registrations.
 * These are shared between client and server for type-safe API calls.
 */
import type {
  Registration,
  UpdateRegistrationInput,
  RegistrationStatus,
  RegistrationSource,
  Attendee,
} from '@maple/ts/domain';
import type { InlineAgreementSigningData } from './agreement.types';

// ============================================================================
// Get Registrations (Admin)
// ============================================================================

export interface GetRegistrationsRequest {
  /** Filter by class ID */
  classId?: string;
  /** Filter by status */
  status?: RegistrationStatus;
  /** Filter by customer email */
  customerEmail?: string;
  /** Filter by registration channel (web vs in-person POS) */
  source?: RegistrationSource;
}

export interface GetRegistrationsResponse {
  registrations: Registration[];
}

// ============================================================================
// Get Registration by ID (Admin)
// ============================================================================

export interface GetRegistrationRequest {
  id: string;
}

export interface GetRegistrationResponse {
  registration: Registration;
}

// ============================================================================
// Update Registration (Admin)
// ============================================================================

export interface UpdateRegistrationRequest extends UpdateRegistrationInput {}

export interface UpdateRegistrationResponse {
  registration: Registration;
}

// ============================================================================
// Cancel Registration (Admin - with optional refund)
// ============================================================================

export interface CancelRegistrationRequest {
  id: string;
  /** Issue a refund via Square */
  refund?: boolean;
}

export interface CancelRegistrationResponse {
  registration: Registration;
  /** Square refund ID if refund was issued */
  refundId?: string;
}

// ============================================================================
// Calculate Registration Cost (Public - for checkout form)
// ============================================================================

export interface CalculateRegistrationCostRequest {
  classId: string;
  quantity: number;
  discountCode?: string;
}

export interface CalculateRegistrationCostResponse {
  /** Original price (class price * quantity) */
  originalCostCents: number;
  /** Discount amount applied */
  discountAmountCents: number;
  /** Post-discount subtotal (pre-tax) */
  finalCostCents: number;
  /** Tax rate as percentage (e.g., 6.0) */
  taxRatePercent: number;
  /** Tax amount in cents */
  taxAmountCents: number;
  /** Total to charge (subtotal + tax) */
  totalCents: number;
  /** Description of discount applied */
  discountDescription?: string;
}

// ============================================================================
// Create Registration (Public - with payment)
// ============================================================================

export interface CreateRegistrationRequest {
  classId: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  /**
   * Total spots requested. The server cross-checks against
   * `1 + additionalAttendees.length` so the client and persisted record can
   * never disagree on capacity.
   */
  quantity: number;
  /** Extra people on the registration. Per-attendee name and email are both optional. */
  additionalAttendees?: Attendee[];
  discountCode?: string;
  notes?: string;
  /** Nonce from Square Web Payments SDK (card tokenization) */
  paymentNonce: string;
  /** Signed agreement data for required-at-checkout agreements */
  agreements?: InlineAgreementSigningData[];
}

export interface CreateRegistrationResponse {
  registration: Registration;
  confirmationNumber: string;
  /** Signing URL for deferred agreements (included in email too) */
  waiverUrl?: string;
  /** True if all agreements were signed at checkout */
  agreementsSigned?: boolean;
}
