import { describe, it, expect } from 'vitest';
import {
  musicTogetherSectionValidation,
  type MusicTogetherSectionValidationInput,
} from './music-together-section.validation';

const valid: MusicTogetherSectionValidationInput = {
  name: 'Spring 2026 — Tuesdays 10am',
  sessions: [{ dateTime: new Date('2026-09-01T14:00:00Z') }],
  capacityFamilies: 8,
  priceFullCents: 25200,
  installmentPlan: [
    { amountCents: 13200, dueAt: new Date('2026-09-01T14:00:00Z') },
    { amountCents: 13200, dueAt: new Date('2026-09-29T14:00:00Z') },
  ],
  visible: true,
  enrollmentActive: true,
};

describe('musicTogetherSectionValidation', () => {
  it('passes a complete section', () => {
    expect(musicTogetherSectionValidation(valid).hasErrors()).toBe(false);
  });

  it('requires a name', () => {
    expect(
      musicTogetherSectionValidation({ ...valid, name: '' }).hasErrors('name')
    ).toBe(true);
  });

  it('requires at least one valid session', () => {
    expect(
      musicTogetherSectionValidation({ ...valid, sessions: [] }).hasErrors(
        'sessions'
      )
    ).toBe(true);
    expect(
      musicTogetherSectionValidation({
        ...valid,
        sessions: [{ dateTime: 'bad' }],
      }).hasErrors('sessions')
    ).toBe(true);
  });

  it('allows a section with no installment plan (pay-in-full only)', () => {
    const fullOnly = { ...valid };
    delete fullOnly.installmentPlan;
    expect(musicTogetherSectionValidation(fullOnly).hasErrors()).toBe(false);
  });

  it('rejects a one-row installment plan (that is just pay-in-full)', () => {
    expect(
      musicTogetherSectionValidation({
        ...valid,
        installmentPlan: [
          { amountCents: 13200, dueAt: new Date('2026-09-01T14:00:00Z') },
        ],
      }).hasErrors('installmentPlan')
    ).toBe(true);
  });

  it('rejects installments with bad amounts, dates, or order', () => {
    // zero amount
    expect(
      musicTogetherSectionValidation({
        ...valid,
        installmentPlan: [
          { amountCents: 0, dueAt: new Date('2026-09-01T14:00:00Z') },
          { amountCents: 13200, dueAt: new Date('2026-09-29T14:00:00Z') },
        ],
      }).hasErrors('installmentPlan')
    ).toBe(true);
    // descending dates
    expect(
      musicTogetherSectionValidation({
        ...valid,
        installmentPlan: [
          { amountCents: 13200, dueAt: new Date('2026-09-29T14:00:00Z') },
          { amountCents: 13200, dueAt: new Date('2026-09-01T14:00:00Z') },
        ],
      }).hasErrors('installmentPlan')
    ).toBe(true);
  });

  it('accepts an N-installment plan', () => {
    expect(
      musicTogetherSectionValidation({
        ...valid,
        installmentPlan: [
          { amountCents: 10500, dueAt: new Date('2026-09-01T14:00:00Z') },
          { amountCents: 10500, dueAt: new Date('2026-09-22T14:00:00Z') },
          { amountCents: 10500, dueAt: new Date('2026-10-13T14:00:00Z') },
        ],
      }).hasErrors('installmentPlan')
    ).toBe(false);
  });

  it('rejects non-positive prices and bad capacity', () => {
    expect(
      musicTogetherSectionValidation({
        ...valid,
        priceFullCents: 0,
      }).hasErrors('priceFullCents')
    ).toBe(true);
    expect(
      musicTogetherSectionValidation({
        ...valid,
        capacityFamilies: 0,
      }).hasErrors('capacityFamilies')
    ).toBe(true);
  });

  it('rejects an enrollment close date before the open date', () => {
    expect(
      musicTogetherSectionValidation({
        ...valid,
        enrollmentOpensAt: new Date('2026-10-01T00:00:00Z'),
        enrollmentClosesAt: new Date('2026-09-01T00:00:00Z'),
      }).hasErrors('enrollmentClosesAt')
    ).toBe(true);
  });

  it('accepts a valid enrollment window', () => {
    expect(
      musicTogetherSectionValidation({
        ...valid,
        enrollmentOpensAt: new Date('2026-09-01T00:00:00Z'),
        enrollmentClosesAt: new Date('2026-10-01T00:00:00Z'),
      }).hasErrors()
    ).toBe(false);
  });
});
