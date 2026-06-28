/**
 * Music Together API request/response types
 *
 * Shared between the public Webflow checkout widget and the Cloud Functions.
 * Dates cross the wire as ISO strings (e.g. child DOBs); the server parses them.
 */
import type {
  MusicTogetherSection,
  MusicTogetherSectionStatus,
  CreateMusicTogetherSectionInput,
  UpdateMusicTogetherSectionInput,
} from '@maple/ts/domain';

// ============================================================================
// Section admin CRUD (authenticated read; admin writes)
// ============================================================================

export interface GetMusicTogetherSectionsRequest {
  status?: MusicTogetherSectionStatus;
}

export interface GetMusicTogetherSectionsResponse {
  sections: MusicTogetherSection[];
}

export type CreateMusicTogetherSectionRequest = CreateMusicTogetherSectionInput;

export interface CreateMusicTogetherSectionResponse {
  section: MusicTogetherSection;
}

export type UpdateMusicTogetherSectionRequest = UpdateMusicTogetherSectionInput;

export interface UpdateMusicTogetherSectionResponse {
  section: MusicTogetherSection;
}

// ============================================================================
// Get Public Section (public — widget loads section + pricing)
// ============================================================================

export interface GetPublicMusicTogetherSectionRequest {
  sectionId: string;
}

/** Public, customer-safe view of a section plus live availability. */
export interface PublicMusicTogetherSection {
  id: string;
  name: string;
  description?: string;
  sessions: { dateTime: string }[];
  priceFullCents: number;
  installmentPlan?: { amountCents: number; dueAt: string }[];
  capacityFamilies: number;
  spotsRemaining: number;
  status: MusicTogetherSection['status'];
  location?: string;
  room?: string;
}

export interface GetPublicMusicTogetherSectionResponse {
  section: PublicMusicTogetherSection;
}

// ============================================================================
// Create Registration (public — checkout, with payment)
// ============================================================================

/** One child on the registration form; `dob` is an ISO date string. */
export interface MusicTogetherChildPayload {
  name: string;
  dob: string;
}

export interface CreateMusicTogetherRegistrationRequest {
  sectionId: string;
  parentNames: string[];
  children: MusicTogetherChildPayload[];
  email: string;
  phone: string;
  address: string;
  /** 'full' = one charge; 'installments' = first charge now + scheduled rest. */
  paymentPlan: 'full' | 'installments';
  policiesAccepted: boolean;
  /** Card-on-file authorization — required when paymentPlan is 'installments'. */
  cardOnFileAuth?: boolean;
  /** Nonce from the Square Web Payments SDK card tokenization. */
  paymentNonce: string;
  notes?: string;
}

export interface CreateMusicTogetherRegistrationResponse {
  registrationId: string;
  status: 'confirmed';
  /** Amount charged at registration (full price, or the first installment). */
  amountChargedCents: number;
  /** Number of scheduled future charges created (0 for pay-in-full). */
  scheduledChargeCount: number;
  /** Last 4 of the card on file, when one was stored (installments). */
  cardLast4?: string;
  squareReceiptUrl?: string;
}

// ============================================================================
// Charge due installments (admin trigger for the scheduled job)
// ============================================================================

export interface ChargeMusicTogetherInstallmentsRequest {
  /** When set, only reports what would be charged — takes no payments. */
  dryRun?: boolean;
}

/** One charge a dry run would have processed. */
export interface MusicTogetherDueChargePreview {
  chargeId: string;
  registrationId: string;
  amountCents: number;
  installmentNumber: number;
}

export interface MusicTogetherInstallmentChargeResult {
  /** Charges that were due (status scheduled, dueAt ≤ now). */
  due: number;
  /** Successfully charged. */
  charged: number;
  /** Failed (declined/errored) — parent emailed, surfaced to admin. */
  failed: number;
  /** Skipped because the lease was already taken or the reg isn't chargeable. */
  skipped: number;
  dryRun: boolean;
  /** Populated only on a dry run. */
  wouldCharge?: MusicTogetherDueChargePreview[];
}

// ============================================================================
// Cancel Registration (admin — refund + cancel scheduled charges)
// ============================================================================

export interface CancelMusicTogetherRegistrationRequest {
  registrationId: string;
}

export interface CancelMusicTogetherRegistrationResponse {
  registrationId: string;
  status: 'cancelled' | 'refunded';
  /** Amount refunded in cents (0 when non-refundable / nothing to refund). */
  refundCents: number;
  refundId?: string;
  /** How many scheduled future charges were cancelled. */
  cancelledChargeCount: number;
}

// ============================================================================
// Join Waitlist (public — shown when a section is full)
// ============================================================================

export interface AddToMusicTogetherWaitlistRequest {
  sectionId: string;
  name: string;
  email: string;
  /** "What days/times work for you?" */
  availability?: string;
}

export interface AddToMusicTogetherWaitlistResponse {
  /** False when the email was already on the list (idempotent no-op). */
  added: boolean;
}
