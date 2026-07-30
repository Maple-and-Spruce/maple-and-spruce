import { describe, it, expect } from 'vitest';
import { musicTogetherDemoValidation } from './music-together-demo.validation';

const valid = {
  dateTime: new Date('2030-08-03T14:00:00Z'),
  location: 'Morgantown Public Library',
  capacityFamilies: 8,
  durationMinutes: 45,
  notes: 'Bring a shaker!',
  visible: true,
};

describe('musicTogetherDemoValidation', () => {
  it('accepts a complete demo', () => {
    const result = musicTogetherDemoValidation(valid);
    expect(result.hasErrors()).toBe(false);
  });

  it('treats an absent duration as valid (undefined, null, or omitted)', () => {
    // A blank duration field persists as null; a strict `!== undefined` guard
    // used to let null reach enforce() and wrongly rejected the demo.
    expect(
      musicTogetherDemoValidation({ ...valid, durationMinutes: undefined }).hasErrors()
    ).toBe(false);
    expect(
      musicTogetherDemoValidation({ ...valid, durationMinutes: null }).hasErrors()
    ).toBe(false);
    const { durationMinutes: _omit, ...noDuration } = valid;
    expect(musicTogetherDemoValidation(noDuration).hasErrors()).toBe(false);
  });

  it('rejects a non-positive duration when one is given', () => {
    expect(
      musicTogetherDemoValidation({ ...valid, durationMinutes: 0 }).hasErrors(
        'durationMinutes'
      )
    ).toBe(true);
  });

  it('requires a dateTime', () => {
    const result = musicTogetherDemoValidation({ ...valid, dateTime: undefined });
    expect(result.hasErrors('dateTime')).toBe(true);
  });

  it('rejects an invalid dateTime string', () => {
    const result = musicTogetherDemoValidation({ ...valid, dateTime: 'not-a-date' });
    expect(result.hasErrors('dateTime')).toBe(true);
  });

  it('accepts an ISO-string dateTime', () => {
    const result = musicTogetherDemoValidation({
      ...valid,
      dateTime: '2030-08-03T14:00:00.000Z',
    });
    expect(result.hasErrors('dateTime')).toBe(false);
  });

  it('requires a non-blank location', () => {
    const result = musicTogetherDemoValidation({ ...valid, location: '   ' });
    expect(result.hasErrors('location')).toBe(true);
  });

  it('caps the location length', () => {
    const result = musicTogetherDemoValidation({
      ...valid,
      location: 'x'.repeat(200),
    });
    expect(result.hasErrors('location')).toBe(true);
  });

  it('requires capacity', () => {
    const result = musicTogetherDemoValidation({
      ...valid,
      capacityFamilies: undefined,
    });
    expect(result.hasErrors('capacityFamilies')).toBe(true);
  });

  it('rejects a non-positive or fractional capacity', () => {
    expect(
      musicTogetherDemoValidation({ ...valid, capacityFamilies: 0 }).hasErrors(
        'capacityFamilies'
      )
    ).toBe(true);
    expect(
      musicTogetherDemoValidation({ ...valid, capacityFamilies: 2.5 }).hasErrors(
        'capacityFamilies'
      )
    ).toBe(true);
  });

  it('rejects a non-positive duration', () => {
    const result = musicTogetherDemoValidation({ ...valid, durationMinutes: 0 });
    expect(result.hasErrors('durationMinutes')).toBe(true);
  });

  it('allows an absent duration (defaulted elsewhere)', () => {
    const result = musicTogetherDemoValidation({
      ...valid,
      durationMinutes: undefined,
    });
    expect(result.hasErrors('durationMinutes')).toBe(false);
  });
});
