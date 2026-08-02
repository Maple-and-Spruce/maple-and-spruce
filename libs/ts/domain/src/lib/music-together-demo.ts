/**
 * Music Together demo-class domain types
 *
 * Music Together runs FREE demo classes so families can try a class before
 * registering for a full section. A demo is a lightweight, admin-managed entity
 * Stephanie creates in the portal: a single dated class at some LOCATION (often
 * OFFSITE — e.g. a public library, not Maple & Spruce), with a family capacity
 * and a waitlist. Visible demos surface on BOTH the public demo RSVP widget and
 * the public Music Together calendar (`/calendar/musictogether.ics`, driven by
 * the `onMusicTogetherDemoWrite` trigger that mirrors `onMusicTogetherSectionWrite`).
 *
 * Demos are free: there is NO section, NO payment, and NO Square — just a
 * capacity-gated RSVP + waitlist (see `MusicTogetherDemoRsvp`).
 */
import { MT_CLASS_DURATION_MINUTES } from './music-together-section';

/** Stable calendar/title text for every demo (they're always free try-a-class). */
export const MT_DEMO_TITLE = 'Music Together Demo (Free)';

/**
 * Music Together demo-class entity — one dated, capacity-gated free demo.
 */
export interface MusicTogetherDemo {
  id: string;
  /** When the demo class happens. */
  dateTime: Date;
  /**
   * FREE-TEXT location — important because demos are often held OFFSITE (e.g.
   * "Morgantown Public Library"), not at Maple & Spruce. Required, non-blank.
   */
  location: string;
  /** Stephanie-set positive family cap; RSVPs past it are waitlisted. */
  capacityFamilies: number;
  /**
   * Class length in minutes. Optional — falls back to the standard MT class
   * duration (`MT_CLASS_DURATION_MINUTES`, 45) when unset. Used to derive the
   * calendar event's end time.
   */
  durationMinutes?: number;
  /** Internal notes for the admin (not shown publicly). */
  notes?: string;
  /**
   * Whether the demo is publicly visible — shown on the demo RSVP widget and
   * the public MT calendar. Mirrors the section `visible` control. Default
   * false (hidden).
   */
  visible: boolean;
  createdAt: Date;
  /**
   * Webflow CMS item ID, stored after a successful Firebase → Webflow sync so
   * later syncs can update/remove the item directly (and to guard the
   * trigger-loop). Set by the sync trigger, never by admin input.
   */
  webflowItemId?: string;
}

/**
 * Input for creating a demo. The server stamps `id` and `createdAt`.
 */
export type CreateMusicTogetherDemoInput = Omit<
  MusicTogetherDemo,
  'id' | 'createdAt'
>;

/**
 * Input for updating a demo.
 */
export type UpdateMusicTogetherDemoInput = Partial<
  Omit<MusicTogetherDemo, 'id' | 'createdAt'>
> & {
  id: string;
};

/** Effective class length in minutes (falls back to the MT default). */
export function mtDemoDurationMinutes(
  demo: Pick<MusicTogetherDemo, 'durationMinutes'>
): number {
  return demo.durationMinutes && demo.durationMinutes > 0
    ? demo.durationMinutes
    : MT_CLASS_DURATION_MINUTES;
}

/**
 * Spots (families) remaining given the current confirmed RSVP count. Never
 * negative.
 */
export function mtDemoSpotsRemaining(
  demo: Pick<MusicTogetherDemo, 'capacityFamilies'>,
  confirmedCount: number
): number {
  return Math.max(0, demo.capacityFamilies - confirmedCount);
}

/** Whether the demo is at/over capacity (next RSVP is waitlisted). */
export function mtDemoIsFull(
  demo: Pick<MusicTogetherDemo, 'capacityFamilies'>,
  confirmedCount: number
): boolean {
  return confirmedCount >= demo.capacityFamilies;
}

/**
 * Public status of a demo, derived from its date and confirmed-RSVP count.
 * Only visible, future-dated demos are synced to Webflow, so in practice the
 * live site sees `open` or `full`; `past` is a defensive fallback.
 */
export type MusicTogetherDemoStatus = 'open' | 'full' | 'past';

/**
 * Derive the public status of a demo. Mirrors `mtSectionDerivedStatus`:
 * past-dated → `past`, at/over capacity → `full`, otherwise `open`.
 */
export function mtDemoDerivedStatus(
  demo: Pick<MusicTogetherDemo, 'dateTime' | 'capacityFamilies'>,
  now: Date,
  confirmedCount: number
): MusicTogetherDemoStatus {
  if (new Date(demo.dateTime).getTime() < now.getTime()) return 'past';
  if (mtDemoIsFull(demo, confirmedCount)) return 'full';
  return 'open';
}

/**
 * Human-readable label for a demo, e.g. "Sat, Aug 3, 10:00 AM · Morgantown
 * Public Library". Used in admin tables and follow-up copy.
 */
export function mtDemoDisplayLabel(
  demo: Pick<MusicTogetherDemo, 'dateTime' | 'location'>
): string {
  const when = new Date(demo.dateTime).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return demo.location ? `${when} · ${demo.location}` : when;
}
