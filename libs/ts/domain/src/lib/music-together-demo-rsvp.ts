/**
 * Music Together demo-class RSVP domain types
 *
 * A family's reservation for one free Music Together demo class
 * (`MusicTogetherDemo`). Stored as a per-demo subcollection
 * (`musicTogetherDemos/{demoId}/rsvps/{emailKey}`, keyed by the lowercased
 * email) — mirroring the section waitlist — so RSVPs scope per demo and are
 * cleaned up if the demo is deleted.
 *
 * Each RSVP is capacity-gated: the first `capacityFamilies` confirmed families
 * get `status: 'confirmed'`; anyone after is `status: 'waitlisted'`. Re-RSVP by
 * the same family (same demo + email) is idempotent — it keeps their existing
 * place and status.
 */

/** Whether a demo RSVP took a seat (`confirmed`) or is on the waitlist. */
export type MusicTogetherDemoRsvpStatus = 'confirmed' | 'waitlisted';

export interface MusicTogetherDemoRsvp {
  /** Document id — the lowercased/trimmed email, making RSVPs idempotent per demo. */
  id: string;
  /** The demo (`MusicTogetherDemo`) this RSVP is for. */
  demoId: string;
  name: string;
  email: string;
  /** Assigned when the RSVP is created: confirmed until cap, then waitlisted. */
  status: MusicTogetherDemoRsvpStatus;
  createdAt: Date;
  /**
   * When the signup confirmation email was queued. Absent means the family has
   * never been confirmed by email — which is what the backfill
   * (`tools/backfill-mt-signup-emails.ts`) looks for, and what keeps a re-run
   * of it from emailing anyone twice.
   */
  signupEmailSentAt?: Date;
  /**
   * When the one-week-out reminder was queued for this RSVP.
   *
   * Demos are a single dated class, so unlike section registrations (whose
   * stamps are keyed per session) a plain timestamp per lead time is enough to
   * make the daily reminder run idempotent.
   */
  reminder7dSentAt?: Date;
  /** When the two-days-out reminder was queued for this RSVP. */
  reminder48hSentAt?: Date;
}

export interface CreateMusicTogetherDemoRsvpInput {
  demoId: string;
  name: string;
  email: string;
}
