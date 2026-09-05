/**
 * Reusable lesson billing rules (#798).
 *
 * Katie and Nathan already save a family's card in Square and initiate the
 * charge by hand. This is not introducing autopay — it is making the thing they
 * already do reliable, repeatable, and something a family only has to act on
 * once.
 *
 * The unit of configuration is a **named rule**, not a per-student setting:
 *
 *   "Standard: 4 lessons every 4 weeks, charged the day before"
 *
 * attached to many students, so a change in studio policy is one edit rather
 * than thirty. A student can deviate without cloning the rule — the same shape
 * `Student.lessonRateCents` already uses to override the rate table. And a
 * studio default means nobody has to configure billing just to enrol someone.
 *
 * WHAT A RULE HAS TO EXPRESS
 * --------------------------
 * David's example is the specification: *"charge once every 4 weeks for 4
 * lessons a day before or day after a scheduled lesson or period."* So:
 * cadence, quantity, and an anchor that is **relative to a lesson**, not to the
 * calendar.
 *
 * Anchoring to a lesson is the part that is easy to get wrong and is the whole
 * point: the charge should land next to the teaching. It also means the anchor
 * moves when the teaching moves, which the calendar cannot do.
 *
 * HOPE IS NEVER TOUCHED
 * ---------------------
 * Hope students bill through the EMA portal (#799) and `createInvoice` refuses
 * them outright. Nothing here may ever produce a charge for one.
 */
import type { Lesson } from './lesson';
import type { Student } from './student';
import { didConsumeSlot } from './lesson';

/**
 * How often a charge is taken.
 *
 * `per-lesson` is the existing behaviour — one invoice per rendered lesson —
 * kept as a rule so that "how this family is billed" has exactly one answer
 * rather than being split between a rule and a legacy path.
 */
export type LessonBillingCadence = 'per-lesson' | 'every-n-lessons';

/**
 * When the charge is taken, relative to the block of lessons it covers.
 *
 * Always relative to a **lesson**, never a calendar date: the studio's month is
 * defined by when it teaches, and a family that skips a fortnight should not be
 * charged on schedule regardless.
 */
export type LessonBillingAnchor = 'before-first' | 'on-first' | 'after-last';

export const LESSON_BILLING_ANCHORS: LessonBillingAnchor[] = [
  'before-first',
  'on-first',
  'after-last',
];

export interface LessonBillingRule {
  id: string;
  /** What Katie calls it: "Standard 4-lesson block". */
  name: string;
  cadence: LessonBillingCadence;
  /** Lessons covered by one charge. Always 1 for `per-lesson`. */
  lessonsPerCharge: number;
  anchor: LessonBillingAnchor;
  /**
   * Days from the anchor lesson. Negative is before it.
   * "the day before" is `anchor: 'before-first', anchorOffsetDays: -1`.
   */
  anchorOffsetDays: number;
  /**
   * A flat amount per charge, when the studio bills a fixed sum regardless of
   * lesson length. Omit to price from the covered lessons at the resolved rate,
   * which is the normal case.
   */
  flatAmountCents?: number;
  /** Exactly one rule is the studio default; new students inherit it. */
  isDefault: boolean;
  /** Retired rules stay for the students still on them; they just can't be picked. */
  archived?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateLessonBillingRuleInput = Omit<
  LessonBillingRule,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateLessonBillingRuleInput = Partial<
  Omit<LessonBillingRule, 'id' | 'createdAt' | 'updatedAt'>
> & { id: string };

/** One charge a rule says should be taken. */
export interface PlannedLessonCharge {
  studentId: string;
  ruleId: string;
  /** The lessons this charge pays for, in order. */
  lessonIds: string[];
  /** When the money should move. */
  dueAt: Date;
  amountCents: number;
}

/**
 * Is this student billed automatically at all?
 *
 * Hope students never are — they bill through EMA, and letting a rule reach one
 * would charge a family for something the state is paying for.
 */
export function isAutoChargeEligible(
  student: Pick<Student, 'status' | 'isHopeScholarship'>
): boolean {
  return student.status === 'active' && !student.isHopeScholarship;
}

/**
 * Which lessons a charge may be taken for.
 *
 * A lesson that consumed the slot (#796) is chargeable — rendered *or*
 * no-show, since studio policy charges a private-pay family for both.
 * A `scheduled` lesson is chargeable too, because these rules bill **ahead** of
 * the teaching; a `cancelled` one never is.
 */
export function isChargeableLesson(
  lesson: Pick<Lesson, 'status'>
): boolean {
  return lesson.status === 'scheduled' || didConsumeSlot(lesson.status);
}

/** Resolve the anchor lesson for a block, given the rule. */
function anchorLessonFor(
  block: Array<Pick<Lesson, 'scheduledAt'>>,
  anchor: LessonBillingAnchor
): Date {
  return anchor === 'after-last'
    ? block[block.length - 1].scheduledAt
    : block[0].scheduledAt;
}

/**
 * Turn a student's lessons into the charges a rule says to take.
 *
 * Lessons are grouped into consecutive blocks of `lessonsPerCharge` **in date
 * order**, and each block produces one charge anchored to its own first or last
 * lesson. A trailing partial block is deliberately **not** charged: billing a
 * family for four lessons when only two are on the books would be taking money
 * for teaching that has not been arranged.
 *
 * `rateResolver` prices a single lesson — it is passed in rather than imported
 * so this stays pure and the caller keeps ownership of per-student overrides.
 */
export function planChargesForStudent(
  studentId: string,
  rule: Pick<
    LessonBillingRule,
    'id' | 'cadence' | 'lessonsPerCharge' | 'anchor' | 'anchorOffsetDays' | 'flatAmountCents'
  >,
  lessons: Array<Pick<Lesson, 'id' | 'scheduledAt' | 'status' | 'durationMinutes'>>,
  rateResolver: (lesson: Pick<Lesson, 'durationMinutes'>) => number
): PlannedLessonCharge[] {
  const chargeable = lessons
    .filter(isChargeableLesson)
    .slice()
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  const size =
    rule.cadence === 'per-lesson' ? 1 : Math.max(1, rule.lessonsPerCharge);

  const planned: PlannedLessonCharge[] = [];

  for (let i = 0; i + size <= chargeable.length; i += size) {
    const block = chargeable.slice(i, i + size);
    const anchorDate = anchorLessonFor(block, rule.anchor);
    const dueAt = new Date(
      anchorDate.getTime() + rule.anchorOffsetDays * 86_400_000
    );

    const amountCents =
      rule.flatAmountCents ??
      block.reduce((sum, lesson) => sum + rateResolver(lesson), 0);

    planned.push({
      studentId,
      ruleId: rule.id,
      lessonIds: block.map((l) => l.id),
      dueAt,
      amountCents,
    });
  }

  return planned;
}

/**
 * Deterministic id for a planned charge.
 *
 * Keyed on the **first lesson it covers**, not on its due date: the due date
 * moves whenever the lesson moves, and a charge that changed id every time a
 * lesson was rescheduled would be taken twice. The lesson id is the stable
 * thing about a block.
 *
 * Same trick as the materialised lesson id (#797) and the Hope submission
 * (#799) — a collision means "already handled", never an error.
 */
export function plannedChargeId(charge: PlannedLessonCharge): string {
  return `chg-${charge.studentId}-${charge.lessonIds[0]}`;
}

/** A rule stated the way Katie would say it, for the picker and the card. */
export function describeBillingRule(
  rule: Pick<
    LessonBillingRule,
    'cadence' | 'lessonsPerCharge' | 'anchor' | 'anchorOffsetDays'
  >
): string {
  const when =
    rule.anchor === 'after-last'
      ? 'after the last lesson'
      : rule.anchor === 'on-first'
        ? 'on the first lesson'
        : 'before the first lesson';

  const offset = Math.abs(rule.anchorOffsetDays);
  const offsetText =
    offset === 0
      ? when
      : `${offset} day${offset === 1 ? '' : 's'} ${rule.anchorOffsetDays < 0 ? 'before' : 'after'} ${
          rule.anchor === 'after-last' ? 'the last lesson' : 'the first lesson'
        }`;

  if (rule.cadence === 'per-lesson') {
    return `Each lesson, charged ${offsetText}`;
  }
  return `Every ${rule.lessonsPerCharge} lessons, charged ${offsetText}`;
}
