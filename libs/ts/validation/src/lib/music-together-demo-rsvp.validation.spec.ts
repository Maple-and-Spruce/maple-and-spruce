import { describe, it, expect } from 'vitest';
import { musicTogetherDemoRsvpValidation } from './music-together-demo-rsvp.validation';

const valid = {
  demoId: 'demo-1',
  name: 'Jamie Rivera',
  email: 'jamie@example.com',
};

describe('musicTogetherDemoRsvpValidation', () => {
  it('accepts a complete RSVP', () => {
    const result = musicTogetherDemoRsvpValidation(valid);
    expect(result.hasErrors()).toBe(false);
  });

  it('requires a demoId', () => {
    const result = musicTogetherDemoRsvpValidation({ ...valid, demoId: '' });
    expect(result.hasErrors('demoId')).toBe(true);
  });

  it('requires a name', () => {
    const result = musicTogetherDemoRsvpValidation({ ...valid, name: '' });
    expect(result.hasErrors('name')).toBe(true);
  });

  it('caps the name length', () => {
    const result = musicTogetherDemoRsvpValidation({
      ...valid,
      name: 'x'.repeat(100),
    });
    expect(result.hasErrors('name')).toBe(true);
  });

  it('requires an email', () => {
    const result = musicTogetherDemoRsvpValidation({ ...valid, email: '' });
    expect(result.hasErrors('email')).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = musicTogetherDemoRsvpValidation({ ...valid, email: 'nope' });
    expect(result.hasErrors('email')).toBe(true);
  });
});
