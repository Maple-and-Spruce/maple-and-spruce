/**
 * Get My Week Cloud Function (#683 / #684)
 *
 * The signed-in teacher's own commitments for a week — the lessons they teach
 * and the classes they teach — plus the shared store-wide events that affect
 * room and context (jams, store hours, Music Together, ad-hoc bookings). One
 * source: the CalendarEvent collection, which already aggregates every
 * category and carries `room` + the denormalized `ownerInstructorId`.
 *
 * Each commitment is tagged:
 *  - `ownership`: `mine` (owned by the caller's instructor) vs `shared`.
 *  - `cadence`:   `recurring` vs `one-off`, inferred from a ~4-week lookback —
 *                 the planning unit is a *typical week*, so a standing weekly
 *                 block is what defines availability; a one-off is an exception
 *                 to manage, never a reason a weekly slot doesn't exist.
 *
 * Role-gated [Admin, LessonTeacher]; scoped to the caller's linked instructor
 * (a caller not linked to any instructor gets `unlinked: true` and no
 * commitments — there's no "mine" to anchor the week to).
 */
import {
  Role,
  createRoleFunction,
  instructorIdForUser,
} from '@maple/firebase/functions';
import { CalendarEventRepository } from '@maple/firebase/database';
import type { CalendarEvent } from '@maple/ts/domain';
import type {
  GetMyWeekRequest,
  GetMyWeekResponse,
  MyWeekCommitment,
} from '@maple/ts/firebase/api-types';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_WEEKS = 4;

/** Server-local start-of-week (Sunday 00:00) for a given instant. */
export function startOfWeek(d: Date): Date {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

/**
 * Recurrence key: an owner's commitments repeat when they land on the same
 * weekday + clock-time in the same category. Shared events group under
 * 'shared' so a weekly jam is still recognized as recurring. Uses server-local
 * weekday/clock — a heuristic; DST shifts a boundary at most twice a year and
 * within a 4-week window that's tolerable.
 */
export function recurrenceKey(event: CalendarEvent): string {
  const s = event.startDateTime;
  const owner = event.ownerInstructorId ?? 'shared';
  const clockMinutes = s.getHours() * 60 + s.getMinutes();
  return `${owner}|${event.type}|${s.getDay()}|${clockMinutes}`;
}

/**
 * Classify each target-week event as recurring/one-off using the lookback
 * window, and tag ownership. Pure — the handler just supplies fetched events.
 *
 * `events` must span [lookbackStart, to); only events in [from, to) are
 * returned as commitments. Recurring = the event's slot appears in ≥2 distinct
 * weeks across the window (counting distinct weeks, not raw occurrences, so two
 * make-ups in one week don't masquerade as a standing slot).
 */
export function buildCommitments(
  events: CalendarEvent[],
  from: Date,
  to: Date,
  lookbackStart: Date,
  myInstructorId: string,
): MyWeekCommitment[] {
  // key -> set of distinct week indices it occurred in
  const weeksByKey = new Map<string, Set<number>>();
  for (const e of events) {
    const weekIndex = Math.floor(
      (e.startDateTime.getTime() - lookbackStart.getTime()) / (7 * DAY_MS),
    );
    const key = recurrenceKey(e);
    const set = weeksByKey.get(key) ?? new Set<number>();
    set.add(weekIndex);
    weeksByKey.set(key, set);
  }

  return events
    .filter(
      (e) =>
        e.startDateTime.getTime() >= from.getTime() &&
        e.startDateTime.getTime() < to.getTime(),
    )
    .sort((a, b) => a.startDateTime.getTime() - b.startDateTime.getTime())
    .map((e) => {
      const weeks = weeksByKey.get(recurrenceKey(e));
      return {
        id: e.id,
        title: e.title,
        category: e.type,
        startDateTime: e.startDateTime.toISOString(),
        endDateTime: e.endDateTime.toISOString(),
        room: e.room ?? null,
        ownership: e.ownerInstructorId === myInstructorId ? 'mine' : 'shared',
        cadence: (weeks?.size ?? 0) >= 2 ? 'recurring' : 'one-off',
      };
    });
}

export const getMyWeek = createRoleFunction<
  GetMyWeekRequest,
  GetMyWeekResponse
>(
  async (data, context) => {
    const myInstructorId = await instructorIdForUser(context.uid);
    if (!myInstructorId) {
      // Not linked to any instructor (e.g. a pure admin) — no "mine" to anchor.
      return { commitments: [], unlinked: true };
    }

    const now = new Date();
    const from = data.from ? new Date(data.from) : startOfWeek(now);
    const to = data.to
      ? new Date(data.to)
      : new Date(from.getTime() + 7 * DAY_MS);
    const lookbackStart = new Date(
      from.getTime() - LOOKBACK_WEEKS * 7 * DAY_MS,
    );

    // One range query over [lookbackStart, to): the target week to display plus
    // the lookback needed to classify recurrence. Partition + classify in memory.
    const events = await CalendarEventRepository.findByStartInRange(
      lookbackStart,
      to,
    );

    const commitments = buildCommitments(
      events,
      from,
      to,
      lookbackStart,
      myInstructorId,
    );

    return { commitments, unlinked: false };
  },
  [Role.Admin, Role.LessonTeacher],
);
