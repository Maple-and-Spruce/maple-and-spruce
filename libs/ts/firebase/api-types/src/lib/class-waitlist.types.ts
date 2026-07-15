/**
 * Class waitlist API request/response types
 *
 * Public endpoints used by the embedded Webflow registration widget when
 * a class is full, plus an admin read endpoint for the portal roster.
 */
import type { ClassWaitlistEntry, PublicClass } from '@maple/ts/domain';

// ============================================================================
// Add to Class Waitlist (public — no auth)
// ============================================================================

export interface AddToClassWaitlistRequest {
  classId: string;
  email: string;
}

export interface AddToClassWaitlistResponse {
  /** True if a new entry was created; false if the email was already on the list. */
  added: boolean;
}

// ============================================================================
// Get Related Public Classes (public — no auth)
// ============================================================================

export interface GetRelatedPublicClassesRequest {
  /** The full class the customer is viewing — its category drives the lookup. */
  classId: string;
  /** Optional cap on results. Server clamps to a sane max. */
  limit?: number;
}

export interface GetRelatedPublicClassesResponse {
  /** Other published classes in the same category with future sessions and spots remaining. */
  classes: PublicClass[];
}

// ============================================================================
// Get Class Waitlist (admin — portal roster)
// ============================================================================

export interface GetClassWaitlistRequest {
  classId: string;
}

export interface GetClassWaitlistResponse {
  /** Waitlist entries for the class, ordered earliest signup first. */
  entries: ClassWaitlistEntry[];
  /** Total number of entries (equals `entries.length`; sent explicitly for convenience). */
  count: number;
}

// ============================================================================
// Get Class Waitlist Counts (admin — classes-list column)
// ============================================================================

/** No filters — returns waitlist counts for every class in one call. */
export type GetClassWaitlistCountsRequest = Record<string, never>;

export interface GetClassWaitlistCountsResponse {
  /** `classId -> waitlist entry count`. Classes with no waitlist are omitted. */
  counts: Record<string, number>;
}
