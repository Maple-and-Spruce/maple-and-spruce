import { describe, it, expect } from 'vitest';
import {
  formatCents,
  getHopeMonthlyEquivalentCents,
  getHopePerLessonRateCents,
  HOPE_MONTHLY_EQUIVALENT_CENTS,
  HOPE_PER_LESSON_RATE_CENTS,
} from './hope-rates';

describe('Hope rates', () => {
  it('exposes per-lesson rates for every LessonLength tier', () => {
    expect(HOPE_PER_LESSON_RATE_CENTS).toEqual({
      '30-min-initial': 3250,
      '30-min-full': 4125,
      '45-min': 5875,
      '60-min': 7500,
    });
  });

  it('exposes monthly equivalents that are ~4× the per-lesson rate', () => {
    expect(HOPE_MONTHLY_EQUIVALENT_CENTS['30-min-initial']).toBe(13000);
    expect(HOPE_MONTHLY_EQUIVALENT_CENTS['30-min-full']).toBe(16500);
    expect(HOPE_MONTHLY_EQUIVALENT_CENTS['45-min']).toBe(23500);
    expect(HOPE_MONTHLY_EQUIVALENT_CENTS['60-min']).toBe(30000);

    // Sanity: monthly should be exactly 4× per-lesson for every tier
    for (const tier of [
      '30-min-initial',
      '30-min-full',
      '45-min',
      '60-min',
    ] as const) {
      expect(HOPE_MONTHLY_EQUIVALENT_CENTS[tier]).toBe(
        HOPE_PER_LESSON_RATE_CENTS[tier] * 4
      );
    }
  });

  it('getHopePerLessonRateCents returns the expected value', () => {
    expect(getHopePerLessonRateCents('30-min-initial')).toBe(3250);
    expect(getHopePerLessonRateCents('60-min')).toBe(7500);
  });

  it('getHopeMonthlyEquivalentCents returns the expected value', () => {
    expect(getHopeMonthlyEquivalentCents('30-min-initial')).toBe(13000);
    expect(getHopeMonthlyEquivalentCents('60-min')).toBe(30000);
  });
});

describe('formatCents', () => {
  it('formats whole dollars with 2 decimal places', () => {
    expect(formatCents(7500)).toBe('$75.00');
    expect(formatCents(10000)).toBe('$100.00');
  });

  it('formats fractional dollars', () => {
    expect(formatCents(3250)).toBe('$32.50');
    expect(formatCents(4125)).toBe('$41.25');
    expect(formatCents(5875)).toBe('$58.75');
  });

  it('handles zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });
});
