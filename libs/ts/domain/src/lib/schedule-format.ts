/**
 * Weekly-planning schedule summaries.
 *
 * Admin table views (classes, students/lessons) think "day of week + time
 * block first, dates second". Given a set of session start times plus a
 * duration, `formatWeekdayTimeBlock` derives:
 *   - the day(s) of week occupied — "Mondays", "Tue & Thu"
 *   - the time block — "6:00–7:30 PM" (or "Varies" when starts differ)
 *   - a secondary date range — "Apr 15 – May 20"
 *   - sort keys for a weekday-first or date-first column sort
 *
 * All derivation is timezone-aware and defaults to America/New_York — the
 * weekday of a late-evening session can differ between ET and the browser's
 * local zone, so the shop timezone is pinned (matching `formatSessions`).
 */

const DEFAULT_TIME_ZONE = 'America/New_York';

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface WeekdayTimeBlock {
  /** Day(s) of week — "Mondays", "Monday", "Tue & Thu". Empty when no starts. */
  dayDisplay: string;
  /** Time block — "6:00–7:30 PM", or "Varies" when starts differ. Empty when no starts. */
  timeBlockDisplay: string;
  /** Secondary date range — "Apr 15 – May 20", or a single "Apr 15". Empty when no starts. */
  dateRangeDisplay: string;
  /** Number of occurrences. */
  count: number;
  /**
   * Sort key for a weekday-first column: earliest occupied weekday index
   * (Sun=0..Sat=6) scaled by minutes-of-day, so same-weekday rows order by
   * start time. POSITIVE_INFINITY when empty (sorts last).
   */
  weekdaySortKey: number;
  /** Sort key for a date-first column: epoch ms of the first start. POSITIVE_INFINITY when empty. */
  dateSortKey: number;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function weekdayIndexInZone(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone,
  }).format(date);
  return WEEKDAY_SHORT.indexOf(name);
}

function minutesOfDayInZone(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

function timeLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
    .format(date)
    // Intl emits a narrow no-break space (U+202F) before AM/PM in modern ICU;
    // normalize to a plain space so output is stable across runtimes.
    .replace(/[\u202f\u00a0]/g, ' ');
}

function dateLabel(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(date);
}

/** Join short weekday names with ampersands: "Mon", "Mon & Wed", "Mon, Wed & Fri". */
function joinWeekdays(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/**
 * Build a start–end block from two time labels, dropping the start's meridiem
 * only when both share it: "6:00–7:30 PM", but "11:30 AM–12:30 PM".
 */
function timeBlock(startLabel: string, endLabel: string): string {
  const startMer = startLabel.match(/[AP]M$/i)?.[0]?.toUpperCase();
  const endMer = endLabel.match(/[AP]M$/i)?.[0]?.toUpperCase();
  const start =
    startMer && endMer && startMer === endMer
      ? startLabel.replace(/\s*[AP]M$/i, '')
      : startLabel;
  return `${start}–${endLabel}`;
}

const EMPTY: WeekdayTimeBlock = {
  dayDisplay: '',
  timeBlockDisplay: '',
  dateRangeDisplay: '',
  count: 0,
  weekdaySortKey: Number.POSITIVE_INFINITY,
  dateSortKey: Number.POSITIVE_INFINITY,
};

/**
 * Summarize a set of session start times (+ shared duration) as a
 * weekly-planning schedule. See {@link WeekdayTimeBlock}.
 *
 * @param starts session/occurrence start times (any order)
 * @param durationMinutes length of each occurrence, for the block end time
 * @param timeZone IANA zone, defaults to America/New_York
 */
export function formatWeekdayTimeBlock(
  starts: Array<Date | string>,
  durationMinutes: number,
  timeZone: string = DEFAULT_TIME_ZONE
): WeekdayTimeBlock {
  const sorted = starts
    .map(toDate)
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (sorted.length === 0) return { ...EMPTY };

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Distinct occupied weekdays, ordered by weekday index.
  const weekdayIndexes = Array.from(
    new Set(sorted.map((d) => weekdayIndexInZone(d, timeZone)))
  ).sort((a, b) => a - b);

  let dayDisplay: string;
  if (weekdayIndexes.length === 1) {
    const full = WEEKDAY_LONG[weekdayIndexes[0]];
    // Pluralize only when it actually recurs; a one-off keeps the singular.
    dayDisplay = sorted.length > 1 ? `${full}s` : full;
  } else {
    dayDisplay = joinWeekdays(weekdayIndexes.map((i) => WEEKDAY_SHORT[i]));
  }

  // Time block — shared when every start lands on the same HH:mm in-zone.
  const firstTime = timeLabel(first, timeZone);
  const sharedTime = sorted.every((d) => timeLabel(d, timeZone) === firstTime);
  let timeBlockDisplay: string;
  if (sharedTime) {
    const end = new Date(first.getTime() + durationMinutes * 60_000);
    timeBlockDisplay = timeBlock(firstTime, timeLabel(end, timeZone));
  } else {
    timeBlockDisplay = 'Varies';
  }

  // Secondary date range.
  const firstDate = dateLabel(first, timeZone);
  const lastDate = dateLabel(last, timeZone);
  const dateRangeDisplay =
    firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`;

  return {
    dayDisplay,
    timeBlockDisplay,
    dateRangeDisplay,
    count: sorted.length,
    weekdaySortKey:
      weekdayIndexes[0] * 1440 + minutesOfDayInZone(first, timeZone),
    dateSortKey: first.getTime(),
  };
}
