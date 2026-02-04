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
} from '@maple/ts/domain';

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
  /** Final price to charge */
  finalCostCents: number;
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
  quantity: number;
  discountCode?: string;
  notes?: string;
  /** Nonce from Square Web Payments SDK (card tokenization) */
  paymentNonce: string;
}

export interface CreateRegistrationResponse {
  registration: Registration;
  confirmationNumber: string;
}
