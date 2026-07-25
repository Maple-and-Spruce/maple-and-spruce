/**
 * Teacher "My Week" API types (#683, #684).
 *
 * The signed-in teacher's own commitments for a week, plus the shared
 * store-wide events that affect room/context, assembled server-side (the
 * client can't resolve which instructor the signed-in user is).
 *
 * Datetimes cross the callable boundary as ISO strings (the client hook
 * parses them) — unlike Date fields, ISO survives JSON serialization
 * unambiguously.
 */
import type { CalendarEventType, Room } from '@maple/ts/domain';

/** Whether a commitment belongs to the caller or is a shared store-wide event. */
export type MyWeekOwnership = 'mine' | 'shared';

/**
 * Whether a commitment is a standing weekly block or a one-off.
 *
 * A commitment is `recurring` when the same owner + category + weekday +
 * clock-time was seen in ≥2 weeks across the lookback window (the target week
 * plus the preceding ~4 weeks). Otherwise it's `one-off` — shown as a
 * this-week-only annotation that never disqualifies a standing slot.
 */
export type MyWeekCadence = 'recurring' | 'one-off';

export interface MyWeekCommitment {
  /** The CalendarEvent id it derives from. */
  id: string;
  title: string;
  category: CalendarEventType;
  /** ISO 8601. */
  startDateTime: string;
  /** ISO 8601. */
  endDateTime: string;
  /** The room it occupies, if any. */
  room: Room | null;
  ownership: MyWeekOwnership;
  cadence: MyWeekCadence;
}

export interface GetMyWeekRequest {
  /** ISO instant for the start of the week (inclusive). Defaults to the
   *  current week's start (server-local Sunday 00:00) when omitted. */
  from?: string;
  /** ISO instant for the end of the week (exclusive). Defaults to `from` + 7
   *  days when omitted. */
  to?: string;
}

export interface GetMyWeekResponse {
  commitments: MyWeekCommitment[];
  /** True when the caller isn't linked to any instructor record (no "mine"). */
  unlinked: boolean;
}
