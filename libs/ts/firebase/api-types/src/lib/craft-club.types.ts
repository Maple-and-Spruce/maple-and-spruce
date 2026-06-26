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
