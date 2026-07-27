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

  it('requires section and a valid email', () => {
    expect(
      musicTogetherWaitlistValidation({ ...valid, sectionId: '' }).hasErrors('sectionId')
    ).toBe(true);
    expect(
      musicTogetherWaitlistValidation({ ...valid, email: 'nope' }).hasErrors('email')
    ).toBe(true);
  });

  it('allows omitting name (email-only "coming soon" capture)', () => {
    const noName = { ...valid };
    delete noName.name;
    expect(musicTogetherWaitlistValidation(noName).hasErrors()).toBe(false);
    // An explicit empty-string name is also fine now (optional field).
    expect(
      musicTogetherWaitlistValidation({ ...valid, name: '' }).hasErrors('name')
    ).toBe(false);
  });

  it('caps name length when present', () => {
    expect(
      musicTogetherWaitlistValidation({
        ...valid,
        name: 'x'.repeat(100),
      }).hasErrors('name')
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
