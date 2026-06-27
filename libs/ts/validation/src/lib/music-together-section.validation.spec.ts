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
  installmentCents: 13200,
  installmentCount: 2,
  week5ChargeAt: new Date('2026-09-29T14:00:00Z'),
  status: 'open',
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

  it('requires a valid week-5 charge date', () => {
    expect(
      musicTogetherSectionValidation({
        ...valid,
        week5ChargeAt: undefined,
      }).hasErrors('week5ChargeAt')
    ).toBe(true);
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

  it('rejects an invalid status', () => {
    expect(
      musicTogetherSectionValidation({
        ...valid,
        status: 'archived',
      }).hasErrors('status')
    ).toBe(true);
  });
});
