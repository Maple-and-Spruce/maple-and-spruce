/**
 * Music Together API request/response types
 *
 * Shared between the public Webflow checkout widget and the Cloud Functions.
 * Dates cross the wire as ISO strings (e.g. child DOBs); the server parses them.
 */
import type { MusicTogetherSection } from '@maple/ts/domain';

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
