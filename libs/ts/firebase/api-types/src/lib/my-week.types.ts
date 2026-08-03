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
import type { CalendarEventType, LessonBlock, Room } from '@maple/ts/domain';

/**
 * A lesson block serialized for the wire — the fit-relevant fields only.
 * LessonBlock's Date fields (createdAt/updatedAt) don't survive JSON cleanly
 * and aren't needed to render or slot the week.
 */
export type MyWeekBlock = Pick<
  LessonBlock,
  'id' | 'teacherId' | 'dayOfWeek' | 'startMinutes' | 'endMinutes' | 'label'
>;

/**
 * Another teacher's block, surfaced to the caller as context. There is one
 * contested lesson room (Spruce), so another teacher's weekly window is time
 * the caller can't schedule a lesson into — shown in the week as an
 * "unavailable" band and subtracted from the caller's openings.
 */
export interface MyWeekOtherBlock extends MyWeekBlock {
  /** Display name of the teacher whose window this is. */
  teacherName: string;
}

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
  /**
   * True only for `mine` lesson commitments that aren't attributed to a
   * fitting block (#689) — the "needs a block" flag. Always false for
   * classes, shared events, and block-attributed lessons.
   */
  unattributed: boolean;
}

/**
 * A synthesized standing (typical-week) slot — a commitment that recurs on the
 * same weekday + clock-time across the lookback, projected onto a generic
 * Sun–Sat week with no concrete date. Powers the "Typical week" planning view
 * (#685): a standing lesson shows in its slot even on a concrete week where its
 * instance is cancelled or missing, and one-offs drop out entirely. Weekday /
 * time are evaluated in the shop timezone (America/New_York) so they line up
 * with lesson blocks.
 */
export interface MyWeekStandingSlot {
  /** Stable id (the recurrence key: owner|category|weekday|startMinutes). */
  id: string;
  /** Weekday 0 (Sun) – 6 (Sat). */
  weekday: number;
  /** Start — minutes from midnight, shop timezone. */
  startMinutes: number;
  /** Duration in minutes, from a representative occurrence. */
  durationMinutes: number;
  category: CalendarEventType;
  ownership: MyWeekOwnership;
  title: string;
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
  /** Concrete commitments for the requested week (the "This week" view). */
  commitments: MyWeekCommitment[];
  /**
   * The standing/typical-week pattern — recurring slots on a generic Sun–Sat,
   * independent of the concrete week's instances (the "Typical week" view).
   */
  standing: MyWeekStandingSlot[];
  /** The caller's own weekly blocks — the containers the week is laid out in. */
  blocks: MyWeekBlock[];
  /**
   * Other teachers' blocks — time the shared Spruce Room is spoken for, so the
   * caller can't schedule then. Shown as context in the week and subtracted
   * from openings.
   */
  otherBlocks: MyWeekOtherBlock[];
  /** True when the caller isn't linked to any instructor record (no "mine"). */
  unlinked: boolean;
}
