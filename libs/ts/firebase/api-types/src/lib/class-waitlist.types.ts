/**
 * Class waitlist API request/response types
 *
 * Public endpoints used by the embedded Webflow registration widget when
 * a class is full.
 */
import type { PublicClass } from '@maple/ts/domain';

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
