import { describe, it, expect } from 'vitest';
import { musicTogetherInterestValidation } from './music-together-interest.validation';

const valid = {
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  interestedSectionIds: ['sec-1'],
  preferenceNote: 'Thursdays',
  alternateTimesNote: '',
  notes: '',
};

describe('musicTogetherInterestValidation', () => {
  it('passes a valid entry with a checked section', () => {
    expect(musicTogetherInterestValidation(valid).hasErrors()).toBe(false);
  });

  it('passes when no section is checked but alternate times are given', () => {
    const result = musicTogetherInterestValidation({
      ...valid,
      interestedSectionIds: [],
      alternateTimesNote: 'Weekday mornings',
    });
    expect(result.hasErrors()).toBe(false);
  });

  it('requires at least a section or alternate-times note', () => {
    const result = musicTogetherInterestValidation({
      ...valid,
      interestedSectionIds: [],
      alternateTimesNote: '',
    });
    expect(result.hasErrors('interestedSectionIds')).toBe(true);
  });

  it('requires a name', () => {
    const result = musicTogetherInterestValidation({ ...valid, name: '' });
    expect(result.hasErrors('name')).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = musicTogetherInterestValidation({
      ...valid,
      email: 'not-an-email',
    });
    expect(result.hasErrors('email')).toBe(true);
  });

  it('rejects blank section ids in the list', () => {
    const result = musicTogetherInterestValidation({
      ...valid,
      interestedSectionIds: ['sec-1', ''],
    });
    expect(result.hasErrors('interestedSectionIds')).toBe(true);
  });

  it('caps note length', () => {
    const result = musicTogetherInterestValidation({
      ...valid,
      notes: 'x'.repeat(1001),
    });
    expect(result.hasErrors('notes')).toBe(true);
  });
});
