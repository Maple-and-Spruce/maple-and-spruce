import { describe, it, expect } from 'vitest';
import {
  effectiveRateByLength,
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

describe('effectiveRateByLength', () => {
  const studio: LessonRateByLength = { '30-min-full': 4000, '45-min': 5500 };
  const teacher = {
    lessonRates: {
      violin: { '30-min-full': 4500 },
      piano: { '30-min-full': 3800, '60-min': 7500 },
    },
  };

  it("uses the teacher's rate for the student's instrument", () => {
    expect(
      effectiveRateByLength({ instrument: 'violin' }, teacher, studio)
    ).toEqual({ '30-min-full': 4500, '45-min': 5500 });
  });

  it('fills lengths the teacher has not priced from the studio default', () => {
    expect(
      effectiveRateByLength({ instrument: 'piano' }, teacher, studio)
    ).toEqual({ '30-min-full': 3800, '45-min': 5500, '60-min': 7500 });
  });

  it('falls back to the studio table for an instrument the teacher has not priced', () => {
    expect(
      effectiveRateByLength({ instrument: 'cello' }, teacher, studio)
    ).toEqual(studio);
  });

  it('falls back to the studio table when there is no teacher', () => {
    expect(effectiveRateByLength({ instrument: 'violin' }, undefined, studio)).toEqual(
      studio
    );
  });

  it('ignores a zero teacher rate rather than pricing lessons at nothing', () => {
    expect(
      effectiveRateByLength(
        { instrument: 'violin' },
        { lessonRates: { violin: { '30-min-full': 0 } } },
        studio
      )
    ).toEqual(studio);
  });

  it("still loses to the student's own rate", () => {
    const table = effectiveRateByLength({ instrument: 'violin' }, teacher, studio);
    expect(
      resolvePrivatePayLessonRateCents(
        { durationMinutes: 30 },
        { registeredLessonLength: '30-min-full', lessonRateCents: 5000 },
        table
      )
    ).toBe(5000);
  });

  it('does not mutate the studio table', () => {
    effectiveRateByLength({ instrument: 'violin' }, teacher, studio);
    expect(studio).toEqual({ '30-min-full': 4000, '45-min': 5500 });
  });
});
