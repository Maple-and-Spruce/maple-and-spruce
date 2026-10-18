import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from './auth-error-message';

describe('getAuthErrorMessage', () => {
  it.each([
    ['auth/invalid-email', 'Invalid email address'],
    ['auth/user-disabled', 'This account has been disabled'],
    ['auth/user-not-found', 'No account found with this email'],
    ['auth/wrong-password', 'Incorrect password'],
    ['auth/invalid-credential', 'Invalid email or password'],
    [
      'auth/too-many-requests',
      'Too many failed attempts. Please try again later',
    ],
  ])('maps %s', (code, message) => {
    expect(getAuthErrorMessage({ code })).toBe(message);
  });

  it('explains that accounts are admin-created when sign-up is restricted', () => {
    expect(
      getAuthErrorMessage({ code: 'auth/admin-restricted-operation' })
    ).toMatch(/created by an administrator/);
  });

  it('does not special-case sign-up errors, since sign-up is disabled', () => {
    const generic = 'An error occurred. Please try again';
    expect(getAuthErrorMessage({ code: 'auth/email-already-in-use' })).toBe(
      generic
    );
    expect(getAuthErrorMessage({ code: 'auth/weak-password' })).toBe(generic);
  });

  it('falls back for errors without a code', () => {
    expect(getAuthErrorMessage(new Error('boom'))).toBe(
      'An unexpected error occurred'
    );
    expect(getAuthErrorMessage(undefined)).toBe('An unexpected error occurred');
  });
});
