import { describe, it, expect } from 'vitest';
import { formatPhoneNumber } from './formatPhoneNumber';

describe('formatPhoneNumber', () => {
  it('returns empty string for empty input', () => {
    expect(formatPhoneNumber('')).toBe('');
  });

  it('returns empty string for non-digit input', () => {
    expect(formatPhoneNumber('abc')).toBe('');
  });

  it('wraps first digit in opening paren', () => {
    expect(formatPhoneNumber('3')).toBe('(3');
  });

  it('formats partial area code', () => {
    expect(formatPhoneNumber('30')).toBe('(30');
    expect(formatPhoneNumber('304')).toBe('(304');
  });

  it('adds closing paren and space after area code', () => {
    expect(formatPhoneNumber('3045')).toBe('(304) 5');
  });

  it('formats 6 digits with exchange', () => {
    expect(formatPhoneNumber('304555')).toBe('(304) 555');
  });

  it('adds dash before last 4 digits', () => {
    expect(formatPhoneNumber('3045551')).toBe('(304) 555-1');
    expect(formatPhoneNumber('3045551234')).toBe('(304) 555-1234');
  });

  it('strips non-digit characters before formatting', () => {
    expect(formatPhoneNumber('(304) 555-1234')).toBe('(304) 555-1234');
    expect(formatPhoneNumber('304-555-1234')).toBe('(304) 555-1234');
    expect(formatPhoneNumber('304.555.1234')).toBe('(304) 555-1234');
  });

  it('truncates to 10 digits', () => {
    expect(formatPhoneNumber('30455512345678')).toBe('(304) 555-1234');
  });
});
