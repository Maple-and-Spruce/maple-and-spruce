/**
 * Hope rate constants + helpers moved to @maple/ts/domain so server-side
 * payout aggregation (#283) can consume them. This module now only
 * re-exports them plus the React-facing `formatCents` presenter.
 */
export {
  HOPE_PER_LESSON_RATE_CENTS,
  HOPE_MONTHLY_EQUIVALENT_CENTS,
  getHopePerLessonRateCents,
  getHopeMonthlyEquivalentCents,
} from '@maple/ts/domain';

/** Format a cents value as "$12.34" for display. */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
