/**
 * Class waitlist domain types
 *
 * Lightweight informal waitlist: customers add their email when a class is
 * full and we broadcast-email everyone if a spot opens (no ordering, no
 * reservation). Stored as a subcollection of the class for auto-cleanup
 * on class delete.
 */

export interface ClassWaitlistEntry {
  /** Document id — the lowercased email, used to make signups idempotent. */
  id: string;
  classId: string;
  email: string;
  createdAt: Date;
}

export type CreateClassWaitlistEntryInput = {
  classId: string;
  email: string;
};
