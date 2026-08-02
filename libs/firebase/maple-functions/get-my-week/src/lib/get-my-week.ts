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
import {
  CalendarEventRepository,
  InstructorRepository,
  LessonBlockRepository,
  LessonRepository,
} from '@maple/firebase/database';
import {
  DEFAULT_LESSON_TIME_ZONE,
  isLessonUnattributed,
  minutesOfDayInZone,
  weekdayIndexInZone,
} from '@maple/ts/domain';
import type { CalendarEvent, LessonBlock } from '@maple/ts/domain';
import type {
  GetMyWeekRequest,
  GetMyWeekResponse,
  MyWeekBlock,
  MyWeekCommitment,
  MyWeekOtherBlock,
  MyWeekStandingSlot,
} from '@maple/ts/firebase/api-types';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_WEEKS = 4;
const TZ = DEFAULT_LESSON_TIME_ZONE;
/** A slot is "standing" once it recurs in at least this many distinct weeks. */
const STANDING_MIN_WEEKS = 2;

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
  /** sourceRefs ("lessons/{id}") of the caller's lessons that need a block. */
  unattributedRefs: Set<string> = new Set(),
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
        unattributed:
          e.type === 'lesson' &&
          !!e.sourceRef &&
          unattributedRefs.has(e.sourceRef),
      };
    });
}

/**
 * Synthesize the standing (typical) week from the lookback: recurring slots
 * projected onto a generic Sun–Sat, independent of any concrete week's
 * instances. A slot is standing when the same owner + category + weekday +
 * clock-time appears in ≥2 distinct weeks across [lookbackStart, to). Weekday /
 * clock are evaluated in the shop timezone so they align with lesson blocks
 * (unlike the concrete `cadence` heuristic, which keys off server-local time).
 * Pure — the handler supplies the same events it fetched for recurrence.
 */
export function buildStandingSlots(
  events: CalendarEvent[],
  lookbackStart: Date,
  myInstructorId: string,
): MyWeekStandingSlot[] {
  interface Agg {
    weeks: Set<number>;
    representative: CalendarEvent;
    weekday: number;
    startMinutes: number;
  }
  const byKey = new Map<string, Agg>();

  for (const e of events) {
    const weekday = weekdayIndexInZone(e.startDateTime, TZ);
    const startMinutes = minutesOfDayInZone(e.startDateTime, TZ);
    const owner = e.ownerInstructorId ?? 'shared';
    const key = `${owner}|${e.type}|${weekday}|${startMinutes}`;
    const weekIndex = Math.floor(
      (e.startDateTime.getTime() - lookbackStart.getTime()) / (7 * DAY_MS),
    );
    const agg = byKey.get(key);
    if (!agg) {
      byKey.set(key, {
        weeks: new Set([weekIndex]),
        representative: e,
        weekday,
        startMinutes,
      });
    } else {
      agg.weeks.add(weekIndex);
      // Keep the most recent occurrence for the title/duration.
      if (
        e.startDateTime.getTime() > agg.representative.startDateTime.getTime()
      ) {
        agg.representative = e;
      }
    }
  }

  const slots: MyWeekStandingSlot[] = [];
  for (const [key, agg] of byKey) {
    if (agg.weeks.size < STANDING_MIN_WEEKS) continue;
    const e = agg.representative;
    const durationMinutes = Math.max(
      Math.round((e.endDateTime.getTime() - e.startDateTime.getTime()) / 60000),
      1,
    );
    slots.push({
      id: key,
      weekday: agg.weekday,
      startMinutes: agg.startMinutes,
      durationMinutes,
      category: e.type,
      ownership: e.ownerInstructorId === myInstructorId ? 'mine' : 'shared',
      title: e.title,
    });
  }
  slots.sort(
    (a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes,
  );
  return slots;
}

/**
 * Blocks owned by other teachers, serialized with the owner's display name.
 * There's one contested lesson room, so these windows are time the caller can't
 * schedule into. Pure — the handler supplies the fetched blocks + name lookup.
 * Sorted by weekday then start for a stable render.
 */
export function buildOtherBlocks(
  allBlocks: LessonBlock[],
  myInstructorId: string,
  teacherNameById: Map<string, string>,
): MyWeekOtherBlock[] {
  return allBlocks
    .filter((b) => b.teacherId !== myInstructorId)
    .map((b) => ({
      ...toMyWeekBlock(b),
      teacherName: teacherNameById.get(b.teacherId) ?? 'Another teacher',
    }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes);
}

/** Serialize a block for the wire (drop Date fields). */
function toMyWeekBlock(block: LessonBlock): MyWeekBlock {
  return {
    id: block.id,
    teacherId: block.teacherId,
    dayOfWeek: block.dayOfWeek,
    startMinutes: block.startMinutes,
    endMinutes: block.endMinutes,
    label: block.label,
  };
}

export const getMyWeek = createRoleFunction<
  GetMyWeekRequest,
  GetMyWeekResponse
>(
  async (data, context) => {
    const myInstructorId = await instructorIdForUser(context.uid);
    if (!myInstructorId) {
      // Not linked to any instructor (e.g. a pure admin) — no "mine" to anchor.
      return {
        commitments: [],
        standing: [],
        blocks: [],
        otherBlocks: [],
        unlinked: true,
      };
    }

    const now = new Date();
    const from = data.from ? new Date(data.from) : startOfWeek(now);
    const to = data.to
      ? new Date(data.to)
      : new Date(from.getTime() + 7 * DAY_MS);
    const lookbackStart = new Date(
      from.getTime() - LOOKBACK_WEEKS * 7 * DAY_MS,
    );

    // One range query over [lookbackStart, to) for recurrence classification,
    // ALL teachers' blocks (mine anchor the layout; others mark room-taken
    // time), this week's lessons to flag unattributed ones (#689), and
    // instructors for the other-block owner names.
    const [events, allBlocks, lessons, instructors] = await Promise.all([
      CalendarEventRepository.findByStartInRange(lookbackStart, to),
      LessonBlockRepository.findAll(),
      LessonRepository.findAll({ teacherId: myInstructorId, from, to }),
      InstructorRepository.findAll(),
    ]);

    const myBlocks = allBlocks.filter((b) => b.teacherId === myInstructorId);
    const teacherNameById = new Map(
      instructors.map((i) => [i.id, i.name]),
    );
    const otherBlocks = buildOtherBlocks(
      allBlocks,
      myInstructorId,
      teacherNameById,
    );

    const unattributedRefs = new Set(
      lessons
        .filter((lesson) => isLessonUnattributed(lesson, myBlocks))
        .map((lesson) => `lessons/${lesson.id}`),
    );

    const commitments = buildCommitments(
      events,
      from,
      to,
      lookbackStart,
      myInstructorId,
      unattributedRefs,
    );

    return {
      commitments,
      standing: buildStandingSlots(events, lookbackStart, myInstructorId),
      blocks: myBlocks.map(toMyWeekBlock),
      otherBlocks,
      unlinked: false,
    };
  },
  [Role.Admin, Role.LessonTeacher],
);
