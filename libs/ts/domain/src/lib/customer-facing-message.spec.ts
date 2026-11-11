import { describe, expect, it } from 'vitest';
import { customerFacingMessage, errorMessageFor } from './customer-facing-message';

describe('customerFacingMessage', () => {
  it('drops the status code Firebase adds', () => {
    expect(customerFacingMessage('Your card was declined. Please try a different card. [400]')).toBe(
      'Your card was declined. Please try a different card.'
    );
  });

  it('drops an HTTP-style code and repeated codes', () => {
    expect(customerFacingMessage('Payment failed [HTTP 402] [400]')).toBe('Payment failed');
  });

  it('leaves a message without a code alone', () => {
    expect(customerFacingMessage('Class is full')).toBe('Class is full');
  });

  it('leaves brackets that are not a status code alone', () => {
    expect(customerFacingMessage('Seats [2] left')).toBe('Seats [2] left');
  });
});

describe('errorMessageFor', () => {
  it('shows a callable error without its status code', () => {
    const error = new Error('Your card was declined. Please try a different card. [400]');
    expect(errorMessageFor(error, 'Something went wrong')).toBe(
      'Your card was declined. Please try a different card.'
    );
  });

  it('falls back for a bare error code', () => {
    expect(errorMessageFor(new Error('internal [500]'), 'Something went wrong')).toBe(
      'Something went wrong'
    );
  });

  it('falls back when there is nothing to show', () => {
    expect(errorMessageFor(undefined, 'Something went wrong')).toBe('Something went wrong');
    expect(errorMessageFor(new Error(' [400]'), 'Something went wrong')).toBe('Something went wrong');
  });

  it('reads a message off a plain error-like object', () => {
    expect(errorMessageFor({ message: 'Class is full [400]' }, 'x')).toBe('Class is full');
  });
});
