/**
 * Music Together waitlist domain types
 *
 * When a section hits its 8-family cap, the public checkout switches to a
 * waitlist that captures the family's name, email, and what days/times work
 * for them. Unlike the class waitlist (unordered, email-only, broadcast), MT's
 * is ORDERED by signup time so the admin can make offers in turn.
 *
 * Stored as a subcollection of the section
 * (`musicTogetherSections/{sectionId}/waitlist/{emailKey}`) so entries are
 * auto-scoped per section and cleaned up if the section is deleted.
 */

export interface MusicTogetherWaitlistEntry {
  /** Document id — the lowercased email, making signups idempotent. */
  id: string;
  sectionId: string;
  name: string;
  email: string;
  /** Free-text answer to "what days/times work for you?" */
  availability?: string;
  createdAt: Date;
}

export type CreateMusicTogetherWaitlistEntryInput = {
  sectionId: string;
  name: string;
  email: string;
  availability?: string;
};
