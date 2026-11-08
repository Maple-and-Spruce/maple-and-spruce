import { describe, expect, it } from 'vitest';
import { customerFacingMessage } from './customer-facing-message';

describe('customerFacingMessage', () => {
  it('drops a trailing status code', () => {
    expect(customerFacingMessage('This gift card has no balance. [400]')).toBe(
      'This gift card has no balance.'
    );
    expect(customerFacingMessage('Card declined [402]')).toBe('Card declined');
  });

  it('drops several, with or without spaces or an HTTP label', () => {
    expect(customerFacingMessage('Try again[400] [HTTP 502]  ')).toBe('Try again');
  });

  it('leaves other brackets and plain messages alone', () => {
    expect(customerFacingMessage('Gift card [ending 1234] is not active')).toBe(
      'Gift card [ending 1234] is not active'
    );
    expect(customerFacingMessage('Code [12345]')).toBe('Code [12345]');
    expect(customerFacingMessage('Please try again.')).toBe('Please try again.');
  });

  it('returns empty when only a status code was there', () => {
    expect(customerFacingMessage(' [400] ')).toBe('');
  });
});
