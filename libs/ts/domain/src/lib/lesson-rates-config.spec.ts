import { describe, it, expect } from 'vitest';
import {
  resolvePrivatePayLessonRateCents,
  type LessonRateByLength,
} from './lesson-rates-config';

const CONFIG: LessonRateByLength = {
  '30-min-initial': 3000,
  '30-min-full': 4000,
  '45-min': 5500,
  '60-min': 7000,
};

describe('resolvePrivatePayLessonRateCents', () => {
  it('uses the per-student override when set', () => {
    expect(
      resolvePrivatePayLessonRateCents(
        { durationMinutes: 60 },
        { lessonRateCents: 9999, registeredLessonLength: '30-min-full' },
        CONFIG
      )
    ).toBe(9999);
  });

  it('uses the configured rate for the student’s registered length', () => {
    expect(
      resolvePrivatePayLessonRateCents(
        { durationMinutes: 30 },
        { registeredLessonLength: '60-min' },
        CONFIG
      )
    ).toBe(7000);
  });

  it('falls back to a tier derived from duration when length is unset', () => {
    expect(
      resolvePrivatePayLessonRateCents({ durationMinutes: 45 }, {}, CONFIG)
    ).toBe(5500);
    // 30-min → 30-min-full (not initial)
    expect(
      resolvePrivatePayLessonRateCents({ durationMinutes: 30 }, {}, CONFIG)
    ).toBe(4000);
  });

  it('returns 0 when nothing is configured for the resolved tier', () => {
    expect(
      resolvePrivatePayLessonRateCents(
        { durationMinutes: 60 },
        { registeredLessonLength: '60-min' },
        {}
      )
    ).toBe(0);
  });

  it('ignores a non-positive override and falls back to config', () => {
    expect(
      resolvePrivatePayLessonRateCents(
        { durationMinutes: 45 },
        { lessonRateCents: 0, registeredLessonLength: '45-min' },
        CONFIG
      )
    ).toBe(5500);
  });
});
