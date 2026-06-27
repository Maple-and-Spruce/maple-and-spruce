import { describe, it, expect } from 'vitest';
import {
  musicTogetherWaitlistValidation,
  type MusicTogetherWaitlistValidationInput,
} from './music-together-waitlist.validation';

const valid: MusicTogetherWaitlistValidationInput = {
  sectionId: 'sec-1',
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
  availability: 'Tuesday or Thursday mornings',
};

describe('musicTogetherWaitlistValidation', () => {
  it('passes a complete entry', () => {
    expect(musicTogetherWaitlistValidation(valid).hasErrors()).toBe(false);
  });

  it('allows omitting availability', () => {
    const noAvail = { ...valid };
    delete noAvail.availability;
    expect(musicTogetherWaitlistValidation(noAvail).hasErrors()).toBe(false);
  });

  it('requires section, name, and a valid email', () => {
    expect(
      musicTogetherWaitlistValidation({ ...valid, sectionId: '' }).hasErrors('sectionId')
    ).toBe(true);
    expect(
      musicTogetherWaitlistValidation({ ...valid, name: '' }).hasErrors('name')
    ).toBe(true);
    expect(
      musicTogetherWaitlistValidation({ ...valid, email: 'nope' }).hasErrors('email')
    ).toBe(true);
  });

  it('caps availability length', () => {
    expect(
      musicTogetherWaitlistValidation({
        ...valid,
        availability: 'x'.repeat(501),
      }).hasErrors('availability')
    ).toBe(true);
  });
});
