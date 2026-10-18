/**
 * Admin-configured private-pay lesson rates (legacy #629).
 *
 * The default per-lesson price by length is set by admins in the app (not
 * hardcoded), stored in a Firestore config doc. Per-student
 * `Student.lessonRateCents` overrides it. The auto-invoice trigger resolves a
 * lesson's price from this config; if nothing resolves (no price configured),
 * it skips rather than invoicing $0.
 */
import type { Instrument, LessonLength, Student } from './student';
import type { Lesson } from './lesson';

/** Default private-pay rate (cents) per lesson length. Partial — the studio
 *  may not offer / price every tier. */
export type LessonRateByLength = Partial<Record<LessonLength, number>>;

/**
 * A teacher's private-lesson prices: instrument → length → cents. Partial at
 * both levels, because a teacher prices only what they teach.
 */
export type InstructorLessonRates = Partial<
  Record<Instrument, LessonRateByLength>
>;

export interface LessonRatesConfig {
  rateByLength: LessonRateByLength;
  updatedAt?: Date;
  updatedByUid?: string;
}

export const EMPTY_LESSON_RATES_CONFIG: LessonRatesConfig = {
  rateByLength: {},
};

/**
 * Map a lesson duration to a default tier when the student has no
 * `registeredLessonLength`. 30-min defaults to `30-min-full` (the common
 * case; `30-min-initial` applies only to brand-new students).
 */
function defaultTierForDuration(durationMinutes: number): LessonLength {
  if (durationMinutes >= 60) return '60-min';
  if (durationMinutes >= 45) return '45-min';
  return '30-min-full';
}

/**
 * Resolve the private-pay rate (cents) to invoice for a rendered lesson:
 *  1. the student's per-student override (`lessonRateCents`), when set;
 *  2. else the configured default for the student's registered lesson length;
 *  3. else the configured default for a tier derived from the lesson duration.
 * Returns 0 when nothing resolves (no price configured for that tier).
 */
export function resolvePrivatePayLessonRateCents(
  lesson: Pick<Lesson, 'durationMinutes'>,
  student: Pick<Student, 'registeredLessonLength' | 'lessonRateCents'>,
  rateByLength: LessonRateByLength
): number {
  if (
    typeof student.lessonRateCents === 'number' &&
    student.lessonRateCents > 0
  ) {
    return student.lessonRateCents;
  }
  if (student.registeredLessonLength) {
    const byLength = rateByLength[student.registeredLessonLength];
    if (byLength && byLength > 0) return byLength;
  }
  const tier = defaultTierForDuration(lesson.durationMinutes);
  return rateByLength[tier] ?? 0;
}

/**
 * The rate table that prices one student's lessons.
 *
 * The student's primary teacher's rates for the student's instrument, with the
 * studio default filling any length the teacher has not priced. Per length, so
 * a teacher who sets only a 30-minute violin rate still gets the studio's
 * 45-minute price rather than nothing.
 *
 * The primary teacher, not whoever taught a given lesson: a family pays the
 * same for a week a substitute covered.
 *
 * `resolvePrivatePayLessonRateCents` takes the result unchanged, so the
 * student's own `lessonRateCents` still wins over all of this.
 */
export function effectiveRateByLength(
  student: Pick<Student, 'instrument'>,
  primaryTeacher: { lessonRates?: InstructorLessonRates } | undefined,
  studioRates: LessonRateByLength
): LessonRateByLength {
  const teacherRates = primaryTeacher?.lessonRates?.[student.instrument] ?? {};
  const merged: LessonRateByLength = { ...studioRates };
  for (const [length, cents] of Object.entries(teacherRates) as Array<
    [LessonLength, number | undefined]
  >) {
    if (typeof cents === 'number' && cents > 0) merged[length] = cents;
  }
  return merged;
}
