/**
 * Standing lesson schedules (#797).
 *
 * Katie and Nathan think in standing arrangements — "Nathan teaches Hazel on
 * Tuesdays at 4:00, thirty minutes, in the Spruce Room". The portal made them
 * manage rows of concrete lessons instead, which is why moving a student to a
 * new day meant editing every remaining row, and why a series just *ran out*
 * on some future Tuesday with billing stopping silently behind it.
 *
 * A `StudentLessonSchedule` is that arrangement as an object. Concrete `Lesson`
 * records still exist and are still what everything downstream reads — rendered
 * status, invoice line items, payouts, block attribution, POS attribution,
 * `/my-day`, derived room events. They are demoted from "the thing a human
 * manages" to "a materialised window", nothing more.
 *
 * WALL-CLOCK, NOT AN INSTANT
 * --------------------------
 * The arrangement stores a weekday and minutes-from-midnight **in the shop
 * timezone**, exactly as `LessonBlock` does. That is what makes a 4:00pm lesson
 * stay 4:00pm across the March and November DST transitions. Storing a UTC
 * offset instead is what makes a studio's whole schedule silently shift by an
 * hour twice a year.
 *
 * EXCEPTIONS ARE FREE
 * -------------------
 * A materialised lesson's document id is derived from the schedule and the
 * occurrence date (`materializedLessonId`), and materialisation uses Firestore
 * `create()`. So:
 *   - re-running is a no-op — the id already exists;
 *   - **skipping one week** is just cancelling that lesson: the document still
 *     exists, so nothing recreates it;
 *   - **moving one week** is just editing that lesson's time: same document id,
 *     so nothing recreates the original slot either.
 * The exception behaviour falls out of the id scheme rather than needing an
 * exceptions table to keep in sync.
 */
import type { Room } from './room';
import { WEEKDAY_SHORT, zonedDateKey } from './schedule-format';

// Re-exported from its original home so existing importers are unaffected;
// it lives in schedule-format now, beside the other zone readers.
export { zonedDateKey };

/** Shop timezone. Matches `DEFAULT_LESSON_TIME_ZONE` on lesson blocks. */
export const SCHEDULE_TIME_ZONE = 'America/New_York';

/**
 * How far ahead lessons are kept on the books.
 *
 * Twelve weeks is far enough that nobody notices the horizon and short enough
 * that a cancelled arrangement does not leave a quarter of junk to clean up.
 */
export const DEFAULT_SCHEDULE_HORIZON_WEEKS = 12;

export type StudentLessonScheduleStatus = 'active' | 'ended';

export interface StudentLessonSchedule {
  id: string;
  studentId: string;
  teacherId: string;
  /** The weekly block this standing slot sits inside (#686). */
  blockId: string;
  /** Weekday, 0 (Sun) – 6 (Sat), in the shop timezone. */
  dayOfWeek: number;
  /** Start time as minutes from midnight, shop-timezone wall clock. */
  startMinutes: number;
  /**
   * Weeks between occurrences. Absent or 1 is weekly; 2 is every other week.
   *
   * Katie has biweekly students and worked around the gap by hand-creating a
   * lesson on each off-week and cancelling it, so the materialiser would skip
   * that date (#837). That is ~26 cancellations a year per student, and it
   * fails silently the first week she is too busy.
   *
   * Two students can alternate in one hour — Marisol and Odette share Tuesday
   * 5pm — so a slot is not owned by one arrangement, and the parity of each
   * has to stand on its own.
   */
  intervalWeeks?: number;
  durationMinutes: number;
  room?: Room;
  /** First date the arrangement applies, inclusive. */
  startsOn: Date;
  /**
   * Last date it applies, inclusive. Absent means open-ended, which is the
   * normal case — rolling enrollment has no end date.
   */
  endsOn?: Date;
  status: StudentLessonScheduleStatus;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateStudentLessonScheduleInput = Omit<
  StudentLessonSchedule,
  'id' | 'createdAt' | 'updatedAt' | 'status'
> & { status?: StudentLessonScheduleStatus };

/** The student and teacher of an arrangement never change — end it and make a new one. */
export type UpdateStudentLessonScheduleInput = Partial<
  Omit<
    StudentLessonSchedule,
    'id' | 'studentId' | 'teacherId' | 'createdAt' | 'updatedAt'
  >
> & { id: string };

/**
 * The UTC offset of a zone at a given instant, in milliseconds.
 *
 * Derived by asking `Intl` what wall-clock the instant reads as in that zone,
 * re-reading that wall-clock as if it were UTC, and taking the difference.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const get = (type: string): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return asIfUtc - instant.getTime();
}

/**
 * Turn a shop-timezone wall clock into the instant it actually happens at.
 *
 * This is the inverse of `minutesOfDayInZone`, and it is the piece that makes
 * DST correct: 4:00pm ET is 20:00Z in summer and 21:00Z in winter, and a
 * schedule must produce whichever one the calendar actually calls for.
 *
 * Two passes: the first guesses using the offset at the naive instant, the
 * second corrects it when that guess landed on the other side of a transition.
 *
 * A wall-clock time that does not exist (2:30am on the spring-forward date)
 * resolves to a neighbouring real instant rather than throwing. Lessons are
 * never scheduled at 2:30am, and refusing to materialise would be worse than
 * being an hour off on a slot nobody uses.
 */
export function zonedWallClockToInstant(
  year: number,
  month: number,
  day: number,
  minutes: number,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date {
  const naiveUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60
  );
  let instant = new Date(naiveUtc);
  for (let pass = 0; pass < 2; pass++) {
    instant = new Date(naiveUtc - zoneOffsetMs(instant, timeZone));
  }
  return instant;
}


/**
 * Deterministic document id for a materialised lesson.
 *
 * This is what makes the whole scheme idempotent, and what makes skipping or
 * moving a single week work without an exceptions table: the id depends only on
 * the arrangement and the date it covers, so a lesson that already exists — in
 * any status, at any time — is never recreated.
 */
export function materializedLessonId(
  scheduleId: string,
  occurrence: Date,
  timeZone: string = SCHEDULE_TIME_ZONE
): string {
  return `sched-${scheduleId}-${zonedDateKey(occurrence, timeZone)}`;
}

/** Is the arrangement in force on this instant? */
export function isScheduleActiveOn(
  schedule: Pick<StudentLessonSchedule, 'status' | 'startsOn' | 'endsOn'>,
  instant: Date
): boolean {
  if (schedule.status !== 'active') return false;
  if (instant.getTime() < schedule.startsOn.getTime()) return false;
  if (schedule.endsOn && instant.getTime() > schedule.endsOn.getTime()) {
    return false;
  }
  return true;
}

/**
 * Every occurrence of a schedule within a window, as concrete instants.
 *
 * Walks calendar days in the shop timezone rather than adding 7×24h, because
 * adding a fixed number of hours drifts by an hour across a DST boundary and
 * would put a 4:00pm lesson at 3:00pm for half the year.
 */
/**
 * Beyond this an arrangement is not a standing slot any more — it is an
 * occasional booking, and the 12-week materialisation horizon would often hold
 * no lessons at all for it.
 */
export const MAX_SCHEDULE_INTERVAL_WEEKS = 4;

/** The cadences a standing arrangement may be set to. */
export const SCHEDULE_INTERVAL_WEEKS = [1, 2, 3, 4] as const;

/**
 * Is this a usable cadence? One definition, shared by both callables and the
 * dialog — a 3-week "biweekly" typo would quietly halve a student's lessons,
 * and #798 bills from the lessons that exist.
 */
export function isValidScheduleInterval(value: unknown): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_SCHEDULE_INTERVAL_WEEKS
  );
}

/** How a cadence reads on its own, for a picker: "Every other week". */
export function cadenceLabel(intervalWeeks: number): string {
  if (intervalWeeks <= 1) return 'Every week';
  if (intervalWeeks === 2) return 'Every other week';
  return `Every ${intervalWeeks} weeks`;
}

/** "Every Tuesday" / "Every other Tuesday" / "Every 3 weeks on Tuesday". */
export function cadencePhrase(
  intervalWeeks: number | undefined,
  weekday: string
): string {
  const n = intervalWeeks ?? 1;
  if (n <= 1) return `Every ${weekday}`;
  if (n === 2) return `Every other ${weekday}`;
  return `Every ${n} weeks on ${weekday}`;
}

/** UTC midnight of an instant's calendar date *as read in the shop zone*. */
function zonedMidnightUtc(instant: Date, timeZone: string): number {
  const [y, m, d] = zonedDateKey(instant, timeZone).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/**
 * The occurrence an alternating pattern counts from: the first one on or after
 * `startsOn`.
 *
 * Anchoring on `startsOn` — not on "the last lesson" — is what makes a
 * biweekly pattern survive a skipped week, a rescheduled lesson, and the
 * materialisation horizon rolling forward. None of those move `startsOn`, so
 * none of them can flip which weeks belong to this student. That matters most
 * where two students alternate in one hour: a parity that drifted would put
 * both of them in the room on the same week.
 */
function scheduleAnchorMidnight(
  schedule: Pick<StudentLessonSchedule, 'dayOfWeek' | 'startsOn'>,
  timeZone: string
): number {
  const [y, m, d] = zonedDateKey(schedule.startsOn, timeZone)
    .split('-')
    .map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d));
  // `startsOn` need not fall on the schedule's weekday, so walk forward to the
  // first day that does. At most seven steps.
  for (let i = 0; i < 7; i++) {
    if (cursor.getUTCDay() === schedule.dayOfWeek) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cursor.getTime();
}

/**
 * Is this candidate on one of the arrangement's weeks?
 *
 * Counted in whole calendar days between two same-weekday dates read in the
 * shop zone, so the answer is exact across a DST boundary — where the elapsed
 * milliseconds between two consecutive occurrences is 7 days give or take an
 * hour, and dividing raw time would eventually round to the wrong week.
 */
function onIntervalWeek(
  candidate: Date,
  anchorMidnight: number,
  interval: number,
  timeZone: string
): boolean {
  if (interval <= 1) return true;
  const weeks = Math.round(
    (zonedMidnightUtc(candidate, timeZone) - anchorMidnight) / (7 * 86_400_000)
  );
  return weeks % interval === 0;
}

export function scheduleOccurrences(
  schedule: Pick<
    StudentLessonSchedule,
    | 'dayOfWeek'
    | 'startMinutes'
    | 'status'
    | 'startsOn'
    | 'endsOn'
    | 'intervalWeeks'
  >,
  from: Date,
  to: Date,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date[] {
  if (to.getTime() < from.getTime()) return [];

  const occurrences: Date[] = [];

  const interval =
    schedule.intervalWeeks && schedule.intervalWeeks > 1
      ? Math.floor(schedule.intervalWeeks)
      : 1;
  const anchorMidnight =
    interval > 1 ? scheduleAnchorMidnight(schedule, timeZone) : 0;

  // Walk in UTC calendar days and convert each candidate; a day either is or is
  // not the schedule's weekday in the shop zone, which the conversion settles.
  const cursor = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() - 1 // start a day early so a boundary day is not missed
    )
  );
  const limit = new Date(to.getTime() + 86_400_000);

  while (cursor.getTime() <= limit.getTime()) {
    const candidate = zonedWallClockToInstant(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
      schedule.startMinutes,
      timeZone
    );

    const weekday = WEEKDAY_SHORT.indexOf(
      new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(
        candidate
      )
    );

    if (
      weekday === schedule.dayOfWeek &&
      onIntervalWeek(candidate, anchorMidnight, interval, timeZone) &&
      candidate.getTime() >= from.getTime() &&
      candidate.getTime() <= to.getTime() &&
      isScheduleActiveOn(schedule, candidate) &&
      !occurrences.some((o) => o.getTime() === candidate.getTime())
    ) {
      occurrences.push(candidate);
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return occurrences;
}

/** The end of the materialisation window from a given moment. */
export function scheduleHorizonEnd(
  now: Date,
  weeks: number = DEFAULT_SCHEDULE_HORIZON_WEEKS
): Date {
  return new Date(now.getTime() + weeks * 7 * 86_400_000);
}
