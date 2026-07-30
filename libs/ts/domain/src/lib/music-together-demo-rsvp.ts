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
}

export interface CreateMusicTogetherDemoRsvpInput {
  demoId: string;
  name: string;
  email: string;
}
