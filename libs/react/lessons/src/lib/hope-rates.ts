/**
 * West Virginia Hope Scholarship per-lesson rates.
 *
 * Hope students are invoiced via the EMA portal per lesson *after* it is
 * rendered — not monthly in advance. These rates are the cents-per-lesson
 * equivalents of Katie's studio monthly tuition (assuming ~4 lessons per
 * month). Update both this map and `HOPE_MONTHLY_EQUIVALENT_CENTS` when
 * studio pricing changes.
 *
 * Source: ESP Handbook + Katie's studio rates (docs captured in #282).
 */
import type { LessonLength } from '@maple/ts/domain';

/**
 * Per-lesson rate in cents, indexed by the student's registered lesson
 * length tier.
 */
export const HOPE_PER_LESSON_RATE_CENTS: Record<LessonLength, number> = {
  '30-min-initial': 3250, // $32.50/lesson  ($130/mo)
  '30-min-full': 4125, // $41.25/lesson  ($165/mo)
  '45-min': 5875, // $58.75/lesson  ($235/mo)
  '60-min': 7500, // $75.00/lesson  ($300/mo)
};

/**
 * Monthly equivalent (4 lessons) in cents — shown alongside the per-lesson
 * rate on the rates table so Katie can sanity-check against studio policy.
 */
export const HOPE_MONTHLY_EQUIVALENT_CENTS: Record<LessonLength, number> = {
  '30-min-initial': 13000,
  '30-min-full': 16500,
  '45-min': 23500,
  '60-min': 30000,
};

export function getHopePerLessonRateCents(
  lessonLength: LessonLength
): number {
  return HOPE_PER_LESSON_RATE_CENTS[lessonLength];
}

export function getHopeMonthlyEquivalentCents(
  lessonLength: LessonLength
): number {
  return HOPE_MONTHLY_EQUIVALENT_CENTS[lessonLength];
}

/** Format a cents value as "$12.34" for display. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
