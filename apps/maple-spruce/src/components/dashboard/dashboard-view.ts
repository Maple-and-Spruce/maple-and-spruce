/**
 * Pure view models for the admin Home dashboard (#235).
 *
 * Everything here takes `now` explicitly, so the cards render the same in a
 * story, a test and the browser, and every date is read through `new Date()`
 * because callable responses carry ISO strings where the domain types say
 * `Date`.
 */
import type {
  Class,
  Registration,
  RequestState,
} from '@maple/ts/domain';
import type { StudioDayLesson } from '@maple/ts/firebase/api-types';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How many upcoming items the Today card shows. */
export const TODAY_ITEM_CAP = 4;
/** How many registrations the Recent registrations card lists. */
export const RECENT_REGISTRATION_CAP = 5;
/** Below this share of capacity a class reads as under-filled. */
export const LOW_FILL_RATIO = 0.4;

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "Wednesday, October 14" */
export function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/** "3:00 PM" */
export function formatClock(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/** "3:00" — the NOW line drops the meridiem. */
export function formatClockShort(d: Date): string {
  return formatClock(d).replace(/\s?[AP]M$/i, '');
}

/** "Thu" */
function weekdayShort(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

/** "Thu, Oct 15" */
function shortDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** "$95", or "$42.50" when there are cents. */
export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

/**
 * A session's day relative to `now`: "Tonight" / "Today" for today (evening
 * starts at 5 PM), else "Thu, Oct 15".
 */
export function relativeDayLabel(when: Date, now: Date): string {
  if (sameLocalDay(when, now)) return when.getHours() >= 17 ? 'Tonight' : 'Today';
  return shortDate(when);
}

/** "Just now", "12m ago", "3h ago", "Yesterday", else the weekday ("Mon"). */
export function relativeTimeAgo(when: Date, now: Date): string {
  const diff = now.getTime() - when.getTime();
  if (diff < 60 * 1000) return 'Just now';
  if (diff < HOUR_MS) return `${Math.floor(diff / 60000)}m ago`;
  if (sameLocalDay(when, now)) return `${Math.floor(diff / HOUR_MS)}h ago`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameLocalDay(when, yesterday)) return 'Yesterday';
  return weekdayShort(when);
}

/** "Ada Teacher" → "Ada" */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// ---------------------------------------------------------------------------
// Request states
// ---------------------------------------------------------------------------

/**
 * Fold several request states into one status: any error wins, then anything
 * not yet loaded, else success. Callers pull the data from each state.
 */
export function combinedStatus(
  states: ReadonlyArray<RequestState<unknown>>,
): RequestState<true> {
  const failed = states.find((s) => s.status === 'error');
  if (failed && failed.status === 'error') {
    return { status: 'error', error: failed.error };
  }
  if (states.some((s) => s.status !== 'success')) return { status: 'loading' };
  return { status: 'success', data: true };
}

// ---------------------------------------------------------------------------
// Registrations per class
// ---------------------------------------------------------------------------

/** What a seat count needs from a registration. */
type SeatRegistration = Pick<Registration, 'classId' | 'status' | 'quantity'>;

function holdsASeat(reg: Pick<Registration, 'status'>): boolean {
  return reg.status === 'confirmed' || reg.status === 'pending';
}

/** Seats taken per class: confirmed + pending, by quantity. */
export function registrationCountsByClass(
  registrations: ReadonlyArray<SeatRegistration>,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const reg of registrations) {
    if (!holdsASeat(reg)) continue;
    map.set(reg.classId, (map.get(reg.classId) ?? 0) + reg.quantity);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

export type AgendaChipTone = 'paid' | 'failed' | 'neutral' | 'pending' | 'class';

export interface AgendaItem {
  id: string;
  kind: 'lesson' | 'class';
  start: Date;
  end: Date;
  title: string;
  detail: string;
  chip: { label: string; tone: AgendaChipTone };
  href: string;
}

export interface AgendaView {
  /** Upcoming and in-progress items, at most `TODAY_ITEM_CAP`. */
  items: AgendaItem[];
  /** Where the NOW line goes: before `items[nowIndex]` (or after them all). */
  nowIndex: number;
  /** Items that already ended today. */
  doneCount: number;
  /** Upcoming items beyond the cap. */
  laterCount: number;
  /** Everything today, finished or not. */
  totalCount: number;
}

function lessonChip(
  payment: StudioDayLesson['payment'],
  now: Date,
): AgendaItem['chip'] {
  switch (payment.state) {
    case 'paid':
      return { label: 'Paid', tone: 'paid' };
    case 'failed':
      return { label: 'Charge failed', tone: 'failed' };
    case 'waived':
      return { label: 'Waived', tone: 'neutral' };
    case 'scheduled': {
      if (!payment.dueAt) return { label: 'Invoiced', tone: 'pending' };
      const due = new Date(payment.dueAt);
      return {
        label: sameLocalDay(due, now) ? 'Charges today' : `Charges ${weekdayShort(due)}`,
        tone: 'pending',
      };
    }
    default:
      return { label: 'Not billed', tone: 'neutral' };
  }
}

function lessonItem(entry: StudioDayLesson, now: Date): AgendaItem {
  const start = toDate(entry.lesson.scheduledAt);
  const end = new Date(start.getTime() + entry.lesson.durationMinutes * 60000);
  const detail = [`with ${firstName(entry.teacherName)}`];
  if (entry.lesson.virtual) detail.push('Online');
  return {
    id: `lesson-${entry.lesson.id}`,
    kind: 'lesson',
    start,
    end,
    title: entry.instrument
      ? `${entry.studentName} · ${entry.instrument}`
      : entry.studentName,
    detail: detail.join(' · '),
    chip: lessonChip(entry.payment, now),
    href: `/students/${entry.lesson.studentId}`,
  };
}

function classItems(
  classes: ReadonlyArray<Class>,
  counts: Map<string, number>,
  now: Date,
): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const c of classes) {
    if (c.status !== 'published') continue;
    const filled = counts.get(c.id) ?? 0;
    (c.sessions ?? []).forEach((session, i) => {
      const start = toDate(session.dateTime);
      if (!sameLocalDay(start, now)) return;
      items.push({
        id: `class-${c.id}-${i}`,
        kind: 'class',
        start,
        end: new Date(start.getTime() + (c.durationMinutes ?? 0) * 60000),
        title: c.name,
        detail: `${filled} of ${c.capacity} registered`,
        chip: { label: `${filled}/${c.capacity}`, tone: 'class' },
        href: `/classes/${c.id}`,
      });
    });
  }
  return items;
}

/**
 * Today's timeline: lessons (every teacher; `null` for a viewer who does not
 * see lessons) and class sessions, by start time. Finished items drop off;
 * the rest are capped, with the NOW line placed before the first that has not
 * started yet.
 */
export function buildAgenda(
  lessons: ReadonlyArray<StudioDayLesson> | null,
  classes: ReadonlyArray<Class>,
  registrations: ReadonlyArray<SeatRegistration>,
  now: Date,
): AgendaView {
  const counts = registrationCountsByClass(registrations);
  const all = [
    ...(lessons ?? [])
      .filter((l) => l.lesson.status !== 'cancelled')
      .map((l) => lessonItem(l, now)),
    ...classItems(classes, counts, now),
  ].sort((a, b) => a.start.getTime() - b.start.getTime());

  const remaining = all.filter((item) => item.end.getTime() > now.getTime());
  const items = remaining.slice(0, TODAY_ITEM_CAP);
  const firstNotStarted = items.findIndex(
    (item) => item.start.getTime() > now.getTime(),
  );
  return {
    items,
    nowIndex: firstNotStarted === -1 ? items.length : firstNotStarted,
    doneCount: all.length - remaining.length,
    laterCount: remaining.length - items.length,
    totalCount: all.length,
  };
}

/** "2 done · 3 later", leaving out the zero parts. */
export function agendaFooterText(view: Pick<AgendaView, 'doneCount' | 'laterCount'>): string {
  const parts: string[] = [];
  if (view.doneCount > 0) parts.push(`${view.doneCount} done`);
  if (view.laterCount > 0) parts.push(`${view.laterCount} later`);
  return parts.join(' · ');
}

/**
 * The page header's one-liner: "4 lessons · 1 class today". `lessonCount` is
 * null for a viewer who does not see lessons.
 */
export function todaySummaryText(
  lessonCount: number | null,
  classCount: number,
): string {
  const parts: string[] = [];
  if (lessonCount) parts.push(plural(lessonCount, 'lesson'));
  if (classCount) parts.push(plural(classCount, 'class', 'classes'));
  return parts.length ? `${parts.join(' · ')} today` : 'Nothing scheduled today';
}

/** Today's lesson and class-session counts, for the header. */
export function todayCounts(
  lessons: ReadonlyArray<StudioDayLesson> | null,
  classes: ReadonlyArray<Class>,
  now: Date,
): { lessons: number | null; classes: number } {
  return {
    lessons: lessons
      ? lessons.filter(
          (l) =>
            l.lesson.status !== 'cancelled' &&
            sameLocalDay(toDate(l.lesson.scheduledAt), now),
        ).length
      : null,
    classes: classItems(classes, new Map(), now).length,
  };
}

// ---------------------------------------------------------------------------
// Recent registrations
// ---------------------------------------------------------------------------

export interface RecentRegistrationRow {
  id: string;
  name: string;
  isNew: boolean;
  detail: string;
  amount: string;
  when: string;
}

export interface RecentRegistrationsView {
  weekCount: number;
  weekBookedCents: number;
  rows: RecentRegistrationRow[];
}

/** The class's next session from today on, else its first. */
function nextSession(c: Class, now: Date): Date | undefined {
  const sessions = (c.sessions ?? [])
    .map((s) => toDate(s.dateTime))
    .sort((a, b) => a.getTime() - b.getTime());
  const today = startOfLocalDay(now).getTime();
  return sessions.find((d) => d.getTime() >= today) ?? sessions[0];
}

export function buildRecentRegistrations(
  registrations: ReadonlyArray<Registration>,
  classes: ReadonlyArray<Class>,
  now: Date,
): RecentRegistrationsView {
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const dayAgo = now.getTime() - DAY_MS;
  const classById = new Map(classes.map((c) => [c.id, c]));

  const inWeek = registrations
    .filter(
      (r) => holdsASeat(r) && toDate(r.createdAt).getTime() >= weekAgo,
    )
    .sort(
      (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime(),
    );

  return {
    weekCount: inWeek.length,
    weekBookedCents: inWeek.reduce((sum, r) => sum + (r.pricePaidCents ?? 0), 0),
    rows: inWeek.slice(0, RECENT_REGISTRATION_CAP).map((r) => {
      const created = toDate(r.createdAt);
      const c = classById.get(r.classId);
      const session = c ? nextSession(c, now) : undefined;
      let detail = 'Unknown class';
      if (c) {
        detail = session ? `${c.name} · ${relativeDayLabel(session, now)}` : c.name;
      }
      return {
        id: r.id,
        name: r.customerName,
        isNew: created.getTime() >= dayAgo,
        detail,
        amount: formatMoney(r.pricePaidCents ?? 0),
        when: relativeTimeAgo(created, now),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Classes this week
// ---------------------------------------------------------------------------

export interface WeekClassRow {
  id: string;
  name: string;
  filled: number;
  capacity: number;
  /** 0..1, clamped. */
  fillRatio: number;
  low: boolean;
  detail: string;
}

export interface ClassesThisWeekView {
  rows: WeekClassRow[];
  openSeats: number;
}

/**
 * Published classes with a session in the next 7 days (one still running
 * counts), soonest first, each with its fill.
 */
export function buildClassesThisWeek(
  classes: ReadonlyArray<Class>,
  registrations: ReadonlyArray<SeatRegistration>,
  now: Date,
): ClassesThisWeekView {
  const counts = registrationCountsByClass(registrations);
  const horizon = now.getTime() + 7 * DAY_MS;

  const upcoming: Array<{ c: Class; session: Date }> = [];
  for (const c of classes) {
    if (c.status !== 'published') continue;
    const durationMs = (c.durationMinutes ?? 0) * 60000;
    const session = (c.sessions ?? [])
      .map((s) => toDate(s.dateTime))
      .filter(
        (d) => d.getTime() + durationMs > now.getTime() && d.getTime() <= horizon,
      )
      .sort((a, b) => a.getTime() - b.getTime())[0];
    if (session) upcoming.push({ c, session });
  }
  upcoming.sort((a, b) => a.session.getTime() - b.session.getTime());

  const rows = upcoming.map(({ c, session }) => {
    const filled = counts.get(c.id) ?? 0;
    const ratio = c.capacity > 0 ? Math.min(filled / c.capacity, 1) : 0;
    return {
      id: c.id,
      name: c.name,
      filled,
      capacity: c.capacity,
      fillRatio: ratio,
      low: ratio < LOW_FILL_RATIO,
      detail: `${relativeDayLabel(session, now)} · ${formatClock(session)} · ${formatMoney(c.priceCents)}`,
    };
  });
  return {
    rows,
    openSeats: rows.reduce((sum, r) => sum + Math.max(r.capacity - r.filled, 0), 0),
  };
}
