import { describe, it, expect } from 'vitest';
import { classWaitlistValidation } from './class-waitlist.validation';

describe('classWaitlistValidation', () => {
  it('passes for a valid classId + email', () => {
    const result = classWaitlistValidation({
      classId: 'class-1',
      email: 'alice@example.com',
    });
    expect(result.hasErrors()).toBe(false);
  });

  it('flags missing classId', () => {
    const result = classWaitlistValidation({
      email: 'alice@example.com',
    });
    expect(result.hasErrors('classId')).toBe(true);
  });

  it('flags missing email', () => {
    const result = classWaitlistValidation({ classId: 'class-1' });
    expect(result.hasErrors('email')).toBe(true);
  });

  it('flags malformed email', () => {
    const result = classWaitlistValidation({
      classId: 'class-1',
      email: 'not-an-email',
    });
    expect(result.hasErrors('email')).toBe(true);
  });

  it('respects single-field scoping via the field arg', () => {
    // Only validate classId; email errors should be suppressed.
    const result = classWaitlistValidation(
      { classId: 'class-1', email: 'bad' },
      'classId'
    );
    expect(result.hasErrors('classId')).toBe(false);
    expect(result.hasErrors('email')).toBe(false);
  });
});
