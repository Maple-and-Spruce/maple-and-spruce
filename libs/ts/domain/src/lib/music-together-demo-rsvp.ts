/**
 * Music Together demo-class RSVP domain types
 *
 * Music Together runs FREE demo classes so families can try a class before
 * registering. This is a lightweight RSVP capture — a family picks one of the
 * configured demo time slots and gives us their name + email so Stephanie can
 * follow up. No payment, no section, no capacity gate.
 *
 * Stored in the flat collection `musicTogetherDemoRsvps`, keyed by the
 * lowercased email so a repeat RSVP is idempotent (updates the chosen slot).
 */

export interface MusicTogetherDemoRsvp {
  /** Document id — the lowercased/trimmed email, making RSVPs idempotent. */
  id: string;
  /** Human-readable demo slot label the family chose (e.g. "Sat Aug 3 · 10:00 AM"). */
  demoSlot: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface CreateMusicTogetherDemoRsvpInput {
  /** Human-readable demo slot label the family chose. */
  demoSlot: string;
  name: string;
  email: string;
}
