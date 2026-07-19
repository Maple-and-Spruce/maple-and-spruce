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
  /**
   * Quantity the server priced for. Echoed back so the UI cost summary
   * can render the canonical multiplier rather than a locally-derived one
   * (which can silently drift from what the backend actually used).
   */
  quantity: number;
  /** Per-attendee price the server used (class price at calc time). */
  pricePerItemCents: number;
  /** Original price (pricePerItemCents * quantity) */
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

// ============================================================================
// Create Registration Checkout Link (Public - Square-hosted checkout fallback)
// ============================================================================

/**
 * Request for a Square-hosted checkout Payment Link. Same fields as
 * CreateRegistrationRequest MINUS the card `paymentNonce` — the buyer pays on
 * Square's own hosted page instead of tokenizing a card inline. This is the
 * fallback used when the embedded Web Payments SDK can't initialize (e.g.
 * Safari ITP blocking its cross-origin iframe).
 */
export interface CreateRegistrationCheckoutLinkRequest {
  classId: string;
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
  quantity: number;
  additionalAttendees?: Attendee[];
  discountCode?: string;
  notes?: string;
  agreements?: InlineAgreementSigningData[];
  /**
   * URL to send the buyer back to after paying on Square's hosted page —
   * normally the class page. The server appends `?reg=<registrationId>` and
   * only honors it when its origin is in the CORS allowlist (open-redirect
   * guard). The returned registration is the source of truth; the param is a
   * pointer the widget verifies by lookup, never proof of payment.
   */
  returnUrl?: string;
}

export interface CreateRegistrationCheckoutLinkResponse {
  /** Square-hosted checkout URL to redirect the buyer to. */
  checkoutUrl: string;
  /** The reserved (pending) registration id — also the Square order referenceId. */
  registrationId: string;
  /** Confirmation number stamped on the reserved registration. */
  confirmationNumber: string;
}
