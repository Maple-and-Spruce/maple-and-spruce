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
import type { Lesson } from './lesson';
import { isChargeableLesson, plannedChargeId } from './lesson-billing-rule';
import { coveredLessonIds } from './lesson-scheduled-charge';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';
import { SCHEDULE_TIME_ZONE } from './student-lesson-schedule';

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
 * gone too — a family paying ahead is buying the teaching still to come, and
 * anything behind them is either already charged or a conversation about a
 * debt, which is not what this button is for.
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
  const available = prepayableLessons(lessons, charges, now, alreadyInvoiced);

  let chosen: typeof available;
  // A **present** `lessonIds` is an explicit selection and is authoritative,
  // even when it is empty. Falling back to `lessonCount` for an empty array is
  // what let the manual picker offer to charge "the next four" with nothing
  // ticked: the checkboxes said one thing and the button said another (#106).
  if (selection.lessonIds) {
    if (selection.lessonIds.length === 0) {
      return { ok: false, problem: 'nothing-picked' };
    }
    const wanted = new Set(selection.lessonIds);
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
    chosen = available.slice(0, Math.max(1, count));
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
