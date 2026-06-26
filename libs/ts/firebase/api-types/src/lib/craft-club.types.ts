/**
 * Craft Club API request/response types
 *
 * Shared between client (admin app + Webflow widgets) and the Cloud Functions
 * for type-safe calls. Phase 1 covers the admin read + approval surface;
 * later phases add the public signup, subscribe, and self-service types here.
 */
import type {
  CraftClubMember,
  CraftClubMemberStatus,
  CraftClubMemberPublicView,
} from '@maple/ts/domain';

// ============================================================================
// Get Craft Club Members (Admin)
// ============================================================================

export interface GetCraftClubMembersRequest {
  /** Filter by membership status. */
  status?: CraftClubMemberStatus;
}

export interface GetCraftClubMembersResponse {
  members: CraftClubMember[];
}

// ============================================================================
// Approve Craft Club Member (Admin)
// ============================================================================

/**
 * Pre-approve an email for the Craft Club. If no member record exists for the
 * email yet, one is created in `approved` status; if a `requested` record
 * exists, it is promoted to `approved`.
 */
export interface ApproveCraftClubMemberRequest {
  email: string;
  /** Optional name to seed the record with. */
  name?: string;
  /** Optional phone to seed the record with. */
  phone?: string;
  /** Optional admin note. */
  notes?: string;
}

export interface ApproveCraftClubMemberResponse {
  member: CraftClubMember;
}

// ============================================================================
// Update Craft Club Member (Admin)
// ============================================================================

/**
 * Admin edit of a member record — notes, or a status change such as revoking
 * approval (`approved` → `requested`/`cancelled`). Square-affecting lifecycle
 * actions (pause/resume/cancel the live subscription) are separate functions
 * introduced in a later phase.
 */
export interface UpdateCraftClubMemberRequest {
  id: string;
  status?: CraftClubMemberStatus;
  notes?: string;
  name?: string;
  phone?: string;
}

export interface UpdateCraftClubMemberResponse {
  member: CraftClubMember;
}

// ============================================================================
// Check Eligibility (Public — signup widget gate)
// ============================================================================

/**
 * Coarse eligibility status for an email at the signup gate:
 * - `approved` — pre-approved, may subscribe now
 * - `active` — already has a live subscription (send to manage)
 * - `requested` — has asked for access, awaiting admin approval
 * - `unknown` — not on file
 */
export type CraftClubEligibilityStatus =
  | 'approved'
  | 'active'
  | 'requested'
  | 'unknown';

export interface CheckCraftClubEligibilityRequest {
  email: string;
}

export interface CheckCraftClubEligibilityResponse {
  status: CraftClubEligibilityStatus;
  /** True when there is already an active/past-due subscription for this email. */
  alreadyMember: boolean;
}

// ============================================================================
// Create Subscription (Public — signup widget, with payment)
// ============================================================================

export interface CreateCraftClubSubscriptionRequest {
  email: string;
  name: string;
  phone?: string;
  /** Nonce from the Square Web Payments SDK card tokenization. */
  paymentNonce: string;
}

export interface CreateCraftClubSubscriptionResponse {
  member: CraftClubMember;
  /** Last 4 digits of the card on file, for display. */
  cardLast4?: string;
}

// ============================================================================
// Request Access (Public — non-approved email capture)
// ============================================================================

export interface RequestCraftClubAccessRequest {
  email: string;
  name?: string;
  phone?: string;
}

export interface RequestCraftClubAccessResponse {
  /** Resulting status so the widget can confirm what happened. */
  status: 'requested' | 'approved' | 'active';
}

// ============================================================================
// Self-service management (Phase 3 — magic link → session)
// ============================================================================

/** Request a magic-link email to manage an existing membership. */
export interface RequestCraftClubManageLinkRequest {
  email: string;
}

export interface RequestCraftClubManageLinkResponse {
  /**
   * Always true — the response is deliberately uniform whether or not the email
   * is a member, to avoid leaking who has a membership.
   */
  ok: true;
}

/** Exchange a single-use magic-link token for a session. */
export interface StartCraftClubSessionRequest {
  token: string;
}

export interface StartCraftClubSessionResponse {
  /** Short-lived session token; pass on every subsequent management call. */
  sessionToken: string;
  member: CraftClubMemberPublicView;
}

export interface GetCraftClubSubscriptionRequest {
  sessionToken: string;
}

export interface GetCraftClubSubscriptionResponse {
  member: CraftClubMemberPublicView;
}

export interface CancelCraftClubSubscriptionRequest {
  sessionToken: string;
}

export interface CancelCraftClubSubscriptionResponse {
  member: CraftClubMemberPublicView;
}

export interface UpdateCraftClubPaymentMethodRequest {
  sessionToken: string;
  /** New nonce from the Square Web Payments SDK card tokenization. */
  paymentNonce: string;
}

export interface UpdateCraftClubPaymentMethodResponse {
  member: CraftClubMemberPublicView;
  /** Last 4 digits of the new card on file. */
  cardLast4?: string;
}
