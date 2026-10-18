/**
 * Paying ahead for a block of lessons (legacy #864).
 *
 * Autopay covers the steady state. This covers the conversation Katie actually
 * has with some families: pay for the next few lessons now, and in exchange the
 * slot is a mutual commitment rather than a week-to-week question. That
 * conversation happens in person, so the money moves there and then.
 *
 * THE SAME RECORD, TAKEN EARLY
 * ----------------------------
 * A prepayment produces the same `LessonScheduledCharge` as an automatic one —
 * same deterministic id, same idempotency key — just already `paid`. It is not
 * a second ledger, because epic #51 decided lesson money has exactly one, and
 * every downstream reader (the charges screen, teacher payouts, the next
 * planning run) keeps working without knowing which way a charge was taken.
 *
 * The whole selection lives here, pure, so that the amount the admin approves
 * on screen and the amount the server charges are produced by one function
 * rather than by two that agree until they don't.
 *
 * NO REFUND PATH, DELIBERATELY
 * ----------------------------
 * Studio policy is that prepaid means committed; a cancelled lesson inside a
 * paid block is not money back. Anything the studio chooses to give back is
 * credited by hand in Square. So nothing here reverses a charge, and the
 * confirmation the admin sees says as much before they take the money.
 */
import { lessonHappened } from './lesson';
import type { Lesson } from './lesson';
import { isChargeableLesson, plannedChargeId } from './lesson-billing-rule';
import { coveredLessonIds } from './lesson-scheduled-charge';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';
import {
  SCHEDULE_TIME_ZONE,
  scheduleOccurrences,
} from './student-lesson-schedule';
import type { StudentLessonSchedule } from './student-lesson-schedule';
import { minutesOfDayInZone, weekdayIndexInZone } from './schedule-format';

/** How many lessons a "pay ahead" covers by default. */
export const DEFAULT_PREPAY_LESSON_COUNT = 4;

/** The counts offered on screen. Four is the block Katie negotiates most. */
export const PREPAY_LESSON_COUNTS = [1, 2, 4, 8, 12];

/** Never take money for more teaching than this in one go. */
export const MAX_PREPAY_LESSON_COUNT = 24;

export type PrepaymentProblem =
  | 'no-lessons'
  | 'nothing-picked'
  | 'already-covered'
  | 'no-rate'
  | 'too-many';

export interface PrepaymentPlan {
  /** The lessons this payment covers, in date order. */
  lessons: Array<Pick<Lesson, 'id' | 'scheduledAt' | 'durationMinutes'>>;
  amountCents: number;
  /** Deterministic id — the same scheme an automatically planned charge uses. */
  chargeId: string;
}

export type PrepaymentOutcome =
  | { ok: true; plan: PrepaymentPlan }
  | { ok: false; problem: PrepaymentProblem };

export interface PrepaymentSelection {
  /** Take these exact lessons. Overrides `lessonCount`. */
  lessonIds?: string[];
  /** Otherwise take this many of the next uncovered lessons. */
  lessonCount?: number;
}

/**
 * Which lessons a family could pay ahead for, soonest first.
 *
 * Lessons already spoken for by a charge are gone: paying twice for one lesson
 * is the failure this whole design exists to prevent. Lessons in the past are
 * not here either — a family paying ahead is buying the teaching still to come.
 *
 * That is a statement about *paying ahead*, not about what the studio may
 * collect. Teaching already given and never paid for is billable too, and lives
 * in `unpaidTaughtLessons` (#128). The two sets are disjoint and together are
 * everything chargeable.
 */
export function prepayableLessons<
  T extends Pick<Lesson, 'id' | 'scheduledAt' | 'status'>,
>(
  lessons: T[],
  charges: LessonScheduledCharge[],
  now: Date,
  /**
   * Lessons a live invoice already asks the family to pay for. Since invoicing
   * became explicit these are the other half of "already billed": a lesson on
   * an invoice must not also be charged to the card (#101).
   */
  alreadyInvoiced: ReadonlySet<string> = new Set()
): T[] {
  const covered = coveredLessonIds(charges);
  return lessons
    .filter(
      (lesson) =>
        isChargeableLesson(lesson) &&
        !covered.has(lesson.id) &&
        !alreadyInvoiced.has(lesson.id) &&
        lesson.scheduledAt.getTime() >= startOfDay(now).getTime()
    )
    .slice()
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

/**
 * Lessons already taught that nobody has paid for, most recent first (#128).
 *
 * The other half of chargeable: `prepayableLessons` sells the teaching still to
 * come, this one collects for teaching already given. Katie could always
 * *invoice* these — the invoice builder has never had a date filter — so the
 * gap this closes is narrow and specific: taking it from the card on file
 * instead of asking twice.
 *
 * **Past means taught (#157).** A past lesson nobody removed happened —
 * `lessonHappened` — so a lesson still marked `scheduled` last Tuesday is owed
 * just like one marked taught. It used to require 'rendered' or 'no-show', and
 * since nobody marks lessons any more that hid every debt until someone did.
 * `prepayableLessons` accepts `scheduled` for the teaching still to come.
 *
 * **Newest first**, the reverse of paying ahead: the useful question about a
 * debt is "what is outstanding from recently", and it matches the order the
 * invoice builder already lists lessons in.
 *
 * Billed-ness is decided exactly as the forward path decides it — the charges
 * that cover a lesson, plus the lessons a live invoice asks for. Notably a
 * *waived* charge still counts as covering here, so a waived lesson is not
 * chargeable; that is #115, it predates this, and making past lessons behave
 * differently from future ones would hide it rather than fix it.
 */
export function unpaidTaughtLessons<
  T extends Pick<Lesson, 'id' | 'scheduledAt' | 'status'>,
>(
  lessons: T[],
  charges: LessonScheduledCharge[],
  now: Date,
  alreadyInvoiced: ReadonlySet<string> = new Set()
): T[] {
  const covered = coveredLessonIds(charges);
  return lessons
    .filter(
      (lesson) =>
        lessonHappened(lesson, now) &&
        !covered.has(lesson.id) &&
        !alreadyInvoiced.has(lesson.id) &&
        lesson.scheduledAt.getTime() < startOfDay(now).getTime()
    )
    .slice()
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime());
}

/**
 * Midnight **in the studio's timezone**, used only to keep *today's* lesson
 * selectable.
 *
 * A lesson earlier today has almost always just been taught, and a family
 * settling up at the door should be able to pay for it. Comparing against the
 * raw clock would drop it an hour after the lesson ended.
 *
 * The timezone has to be the studio's rather than the runtime's, because this
 * runs in two places: the browser (Eastern, at the desk) and Cloud Run (UTC).
 * Taking the runtime's meant that from 8pm Eastern the server's "today" had
 * already rolled over, so it dropped the lesson the admin was looking at and
 * the refusal came back as "already covered by another charge" — which was not
 * true and not fixable by the reload it suggested (#103).
 */
function startOfDay(now: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCHEDULE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  // How far into the studio's day we are, subtracted from the instant itself:
  // no calendar arithmetic, so DST transitions need no special case.
  const sinceMidnightMs =
    ((get('hour') % 24) * 60 * 60 + get('minute') * 60 + get('second')) * 1000 +
    now.getMilliseconds();
  return new Date(now.getTime() - sinceMidnightMs);
}

/**
 * Midnight at the start of tomorrow, in the studio's timezone.
 *
 * Thirty hours past today's midnight always lands in tomorrow, whether today
 * is 23, 24 or 25 hours long, so DST needs no special case here either.
 */
function startOfNextDay(now: Date): Date {
  return startOfDay(new Date(startOfDay(now).getTime() + 30 * 60 * 60 * 1000));
}

/**
 * Turn a selection into the charge to take, or the reason there isn't one.
 *
 * `rateResolver` prices one lesson, passed in for the same reason it is on
 * `planChargesForStudent`: this stays pure and the caller keeps ownership of
 * per-student rate overrides.
 */
export function planPrepayment(
  studentId: string,
  lessons: Array<Pick<Lesson, 'id' | 'scheduledAt' | 'status' | 'durationMinutes'>>,
  charges: LessonScheduledCharge[],
  selection: PrepaymentSelection,
  rateResolver: (lesson: Pick<Lesson, 'durationMinutes'>) => number,
  now: Date = new Date(),
  alreadyInvoiced: ReadonlySet<string> = new Set()
): PrepaymentOutcome {
  const upcoming = prepayableLessons(lessons, charges, now, alreadyInvoiced);

  let chosen: typeof upcoming;
  // A **present** `lessonIds` is an explicit selection and is authoritative,
  // even when it is empty. Falling back to `lessonCount` for an empty array is
  // what let the manual picker offer to charge "the next four" with nothing
  // ticked: the checkboxes said one thing and the button said another (#106).
  if (selection.lessonIds) {
    if (selection.lessonIds.length === 0) {
      return { ok: false, problem: 'nothing-picked' };
    }
    const wanted = new Set(selection.lessonIds);
    // An explicit selection may name teaching already given (#128). Only an
    // explicit one: the `lessonCount` shortcut below stays upcoming-only, so
    // "charge the next four" can never quietly collect a debt the admin did
    // not tick. Deliberately naming a past lesson is a decision; being handed
    // one by a default is an accident.
    const available = [
      ...upcoming,
      ...unpaidTaughtLessons(lessons, charges, now, alreadyInvoiced),
    ];
    chosen = available.filter((lesson) => wanted.has(lesson.id));
    // Every id the caller named must have survived the filter. If one did not,
    // it is either already covered or no longer chargeable — and charging for
    // "most of what you picked" without saying so is how a family ends up
    // paying for a lesson twice.
    if (chosen.length !== wanted.size) {
      return { ok: false, problem: 'already-covered' };
    }
  } else {
    const count = selection.lessonCount ?? DEFAULT_PREPAY_LESSON_COUNT;
    if (count > MAX_PREPAY_LESSON_COUNT) {
      return { ok: false, problem: 'too-many' };
    }
    chosen = upcoming.slice(0, Math.max(1, count));
  }

  if (chosen.length === 0) {
    return { ok: false, problem: 'no-lessons' };
  }
  if (chosen.length > MAX_PREPAY_LESSON_COUNT) {
    return { ok: false, problem: 'too-many' };
  }

  const amountCents = chosen.reduce(
    (sum, lesson) => sum + rateResolver(lesson),
    0
  );

  // A block that prices at nothing means no rate resolved for this student.
  // Taking $0 would look like a successful payment and leave the lessons
  // marked paid for, so it is refused rather than recorded.
  if (amountCents <= 0) {
    return { ok: false, problem: 'no-rate' };
  }

  return {
    ok: true,
    plan: {
      lessons: chosen,
      amountCents,
      chargeId: plannedChargeId({
        studentId,
        ruleId: '',
        lessonIds: chosen.map((l) => l.id),
        dueAt: now,
        amountCents,
      }),
    },
  };
}

/** Why a prepayment can't be taken, in the words the admin needs. */
export function describePrepaymentProblem(problem: PrepaymentProblem): string {
  switch (problem) {
    case 'no-lessons':
      return 'There are no upcoming lessons left to pay for. Schedule some first.';
    case 'nothing-picked':
      return 'Tick the lessons this payment covers.';
    case 'already-covered':
      return 'One of those lessons is already covered by another charge. Reload and pick again.';
    case 'no-rate':
      return 'No lesson rate is set for this student, so there is nothing to charge.';
    case 'too-many':
      return `That is more than ${MAX_PREPAY_LESSON_COUNT} lessons in one payment.`;
  }
}

const WEEK_MS = 7 * 86_400_000;

/**
 * The dates that would bring "the next N" up to N, one a week at the same
 * weekday and time as `like`.
 *
 * Katie plans in fours. A student who is not on a weekly time yet often has a
 * couple of lessons made by hand, and "the next 4" then quietly covers two.
 * This is what the missing ones would be: the weeks after `like`, skipping any
 * week the student already has a lesson in (so a lesson made for the 13th is
 * not doubled by a new one on the 13th), until `needed` dates are found.
 *
 * Weekly from `like`, read in the studio's timezone so a clock change does not
 * move 5:00 PM to 4:00 PM. Pure; the caller creates the lessons.
 */
export function fillWeeklyLessonDates(
  like: Pick<Lesson, 'scheduledAt'>,
  /** Every lesson the student has from `like` on that is still happening. */
  existing: Array<Pick<Lesson, 'scheduledAt' | 'status'>>,
  needed: number,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date[] {
  if (needed <= 0) return [];

  const taken = existing
    .filter((l) => l.status !== 'cancelled')
    .map((l) => l.scheduledAt.getTime());
  // A week is "taken" if the student has a lesson within half a week of the
  // candidate: a lesson moved to the Monday still means that week is covered.
  const weekTaken = (at: Date) =>
    taken.some((t) => Math.abs(t - at.getTime()) < WEEK_MS / 2);

  const from = like.scheduledAt;
  // Enough weeks for every existing lesson to sit in one, plus the new ones.
  const to = new Date(from.getTime() + (needed + taken.length + 1) * WEEK_MS);
  const occurrences = scheduleOccurrences(
    {
      dayOfWeek: weekdayIndexInZone(from, timeZone),
      startMinutes: minutesOfDayInZone(from, timeZone),
      status: 'active',
      startsOn: from,
      endsOn: undefined,
      intervalWeeks: 1,
    },
    from,
    to,
    timeZone
  );

  const dates: Date[] = [];
  for (const at of occurrences) {
    if (dates.length >= needed) break;
    if (weekTaken(at)) continue;
    dates.push(at);
  }
  return dates;
}

/** What "the next N" means for one student right now (#157). */
export interface NextLessonsPlan<T> {
  /**
   * Upcoming lessons already on the calendar and not yet paid for, soonest
   * first. They count toward the N: booking four more on top of two unpaid
   * ones would ask the family for six.
   */
  booked: T[];
  /** Weekly-time dates still to book to make up the N, soonest first. */
  toBook: Date[];
  /**
   * The student has no active weekly time, so there is nothing to propose
   * beyond `booked`. The caller offers to set one instead.
   */
  noSlot: boolean;
}

/**
 * The lessons Katie books and takes payment for at the end of a lesson (#157).
 *
 * Lessons are no longer generated ahead of time: the weekly time is a planning
 * note, and the calendar holds only what has been booked. So "the next 4" is
 * the upcoming lessons already booked and unpaid, topped up with dates from
 * the weekly time.
 *
 * **New dates go after everything already booked**, paid or not. A family
 * that has paid through the 28th and pays again early is buying from the
 * following lesson on, not filling gaps before the 28th. The weekly time's
 * cadence and its start and end dates are respected, so a biweekly student
 * gets every other week.
 *
 * **"Next" starts tomorrow.** Katie plans the next four while she is at
 * today's lesson, so today's lesson is the current one, not the first of the
 * next four — even before it has started, and even if it is unpaid. It stays
 * chargeable on its own (`prepayableLessons` still includes today); it just is
 * not proposed here.
 *
 * Pure; the caller creates the lessons and takes the payment.
 */
export function planNextLessons<
  T extends Pick<Lesson, 'id' | 'scheduledAt' | 'status'>,
>(
  schedule:
    | Pick<
        StudentLessonSchedule,
        | 'dayOfWeek'
        | 'startMinutes'
        | 'status'
        | 'startsOn'
        | 'endsOn'
        | 'intervalWeeks'
      >
    | undefined,
  lessons: T[],
  charges: LessonScheduledCharge[],
  now: Date,
  alreadyInvoiced: ReadonlySet<string> = new Set(),
  count: number = DEFAULT_PREPAY_LESSON_COUNT,
  timeZone: string = SCHEDULE_TIME_ZONE
): NextLessonsPlan<T> {
  const tomorrow = startOfNextDay(now);
  const booked = prepayableLessons(lessons, charges, now, alreadyInvoiced)
    .filter((lesson) => lesson.scheduledAt.getTime() >= tomorrow.getTime())
    .slice(0, count);
  const needed = count - booked.length;
  const noSlot = !schedule || schedule.status !== 'active';
  if (needed <= 0 || !schedule || noSlot) {
    return { booked, toBook: [], noSlot };
  }

  const lastBooked = lessons
    .filter((l) => l.status !== 'cancelled')
    .reduce((latest, l) => Math.max(latest, l.scheduledAt.getTime()), 0);
  const from = new Date(Math.max(tomorrow.getTime(), lastBooked + 1));

  const interval =
    schedule.intervalWeeks && schedule.intervalWeeks > 1
      ? Math.floor(schedule.intervalWeeks)
      : 1;
  // Wide enough for `needed` occurrences at the slot's cadence, plus a week
  // of slack for `from` landing just after this week's slot.
  const to = new Date(from.getTime() + (needed * interval + 1) * WEEK_MS);

  const toBook = scheduleOccurrences(schedule, from, to, timeZone).slice(
    0,
    needed
  );
  return { booked, toBook, noSlot };
}
