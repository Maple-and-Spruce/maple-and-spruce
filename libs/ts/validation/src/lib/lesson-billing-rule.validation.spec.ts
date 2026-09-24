import { describe, expect, it } from 'vitest';
import {
  MAX_ANCHOR_OFFSET_DAYS,
  MAX_LESSONS_PER_CHARGE,
  lessonBillingRuleValidation,
} from './lesson-billing-rule.validation';
import type { CreateLessonBillingRuleInput } from '@maple/ts/domain';

/** The rule Katie negotiates most: four lessons, charged the day before. */
function rule(
  over: Partial<CreateLessonBillingRuleInput> = {}
): Partial<CreateLessonBillingRuleInput> {
  return {
    name: 'Standard 4-lesson block',
    cadence: 'every-n-lessons',
    lessonsPerCharge: 4,
    anchor: 'before-first',
    anchorOffsetDays: -1,
    isDefault: false,
    ...over,
  };
}

const errorsFor = (input: Partial<CreateLessonBillingRuleInput>) =>
  lessonBillingRuleValidation(input).getErrors();

describe('what makes a billing rule valid', () => {
  it('accepts the standard block', () => {
    expect(lessonBillingRuleValidation(rule()).isValid()).toBe(true);
  });

  it('accepts a per-lesson rule, where the count is always one', () => {
    expect(
      lessonBillingRuleValidation(
        rule({ cadence: 'per-lesson', lessonsPerCharge: 1 })
      ).isValid()
    ).toBe(true);
  });

  it('needs a name, because a rule is something Katie refers to by name', () => {
    expect(errorsFor(rule({ name: '' })).name).toContain('A rule needs a name');
    expect(errorsFor(rule({ name: '   ' })).name).toBeTruthy();
  });

  it('refuses a charge that covers no lessons', () => {
    expect(errorsFor(rule({ lessonsPerCharge: 0 })).lessonsPerCharge).toContain(
      'A charge has to cover at least one lesson'
    );
  });

  it('ignores the lesson count on a per-lesson rule', () => {
    // `per-lesson` is one lesson by definition, so a stale 0 in the form must
    // not block a rule that cannot use the field.
    expect(
      lessonBillingRuleValidation(
        rule({ cadence: 'per-lesson', lessonsPerCharge: 0 })
      ).isValid()
    ).toBe(true);
  });

  it('refuses an implausibly large block', () => {
    expect(
      errorsFor(rule({ lessonsPerCharge: MAX_LESSONS_PER_CHARGE + 1 }))
        .lessonsPerCharge
    ).toBeTruthy();
  });

  it('refuses a fractional lesson count', () => {
    expect(errorsFor(rule({ lessonsPerCharge: 2.5 })).lessonsPerCharge).toContain(
      'Lessons per charge must be a whole number'
    );
  });

  it('keeps the charge near the teaching it pays for', () => {
    // The check that stops a typo billing a family months out of step.
    expect(
      errorsFor(rule({ anchorOffsetDays: MAX_ANCHOR_OFFSET_DAYS + 1 }))
        .anchorOffsetDays
    ).toBeTruthy();
    expect(
      errorsFor(rule({ anchorOffsetDays: -(MAX_ANCHOR_OFFSET_DAYS + 1) }))
        .anchorOffsetDays
    ).toBeTruthy();
    expect(
      lessonBillingRuleValidation(
        rule({ anchorOffsetDays: MAX_ANCHOR_OFFSET_DAYS })
      ).isValid()
    ).toBe(true);
  });

  it('accepts a zero offset — charged on the lesson itself', () => {
    expect(
      lessonBillingRuleValidation(
        rule({ anchor: 'on-first', anchorOffsetDays: 0 })
      ).isValid()
    ).toBe(true);
  });

  it('refuses an unknown anchor', () => {
    expect(
      errorsFor(rule({ anchor: 'whenever' as never })).anchor
    ).toBeTruthy();
  });

  it('leaves the flat amount optional, since most rules price from the lessons', () => {
    expect(lessonBillingRuleValidation(rule()).isValid()).toBe(true);
    expect(
      lessonBillingRuleValidation(rule({ flatAmountCents: 12000 })).isValid()
    ).toBe(true);
  });

  it('refuses a flat amount of nothing, which would charge nothing or refund', () => {
    expect(errorsFor(rule({ flatAmountCents: 0 })).flatAmountCents).toContain(
      'A flat amount must be more than zero'
    );
    expect(errorsFor(rule({ flatAmountCents: -500 })).flatAmountCents).toBeTruthy();
  });

  it('validates one field at a time for a form', () => {
    // `only()` is what lets a form show an error next to the field being typed
    // in without lighting up every other one.
    const result = lessonBillingRuleValidation(rule({ name: '' }), 'name');
    expect(result.getErrors().name).toBeTruthy();
    expect(result.getErrors().anchorOffsetDays).toBeUndefined();
  });
});
