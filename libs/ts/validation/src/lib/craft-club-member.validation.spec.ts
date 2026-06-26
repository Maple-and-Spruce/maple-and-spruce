import { describe, it, expect } from 'vitest';
import { craftClubMemberValidation } from './craft-club-member.validation';

describe('craftClubMemberValidation', () => {
  it('passes with a valid email only', () => {
    const result = craftClubMemberValidation({ email: 'a@b.com' });
    expect(result.hasErrors()).toBe(false);
  });

  it('requires an email', () => {
    const result = craftClubMemberValidation({});
    expect(result.hasErrors('email')).toBe(true);
  });

  it('rejects a malformed email', () => {
    const result = craftClubMemberValidation({ email: 'nope' });
    expect(result.hasErrors('email')).toBe(true);
  });

  it('rejects a one-character name but allows omitting it', () => {
    expect(
      craftClubMemberValidation({ email: 'a@b.com', name: 'x' }).hasErrors(
        'name'
      )
    ).toBe(true);
    expect(
      craftClubMemberValidation({ email: 'a@b.com' }).hasErrors('name')
    ).toBe(false);
  });

  it('rejects an invalid phone but allows omitting it', () => {
    expect(
      craftClubMemberValidation({ email: 'a@b.com', phone: 'abc' }).hasErrors(
        'phone'
      )
    ).toBe(true);
    expect(
      craftClubMemberValidation({
        email: 'a@b.com',
        phone: '(304) 555-1212',
      }).hasErrors('phone')
    ).toBe(false);
  });

  it('supports single-field validation via only()', () => {
    // Validating just "name" should not flag the missing email.
    const result = craftClubMemberValidation({ name: 'Valid Name' }, 'name');
    expect(result.hasErrors('email')).toBe(false);
    expect(result.hasErrors('name')).toBe(false);
  });
});
