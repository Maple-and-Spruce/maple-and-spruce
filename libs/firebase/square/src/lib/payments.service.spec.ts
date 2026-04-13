import { describe, it, expect } from 'vitest';
import { getPaymentErrorMessage, PaymentError } from './payments.service';

describe('getPaymentErrorMessage', () => {
  it('should return user-friendly message for CARD_DECLINED', () => {
    const errors = [{ code: 'CARD_DECLINED', detail: 'Card declined' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your card was declined. Please try a different card.'
    );
  });

  it('should return user-friendly message for CVV_FAILURE', () => {
    const errors = [{ code: 'CVV_FAILURE', detail: 'CVV check failed' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'The CVV number is incorrect. Please check your card details and try again.'
    );
  });

  it('should return user-friendly message for INSUFFICIENT_FUNDS', () => {
    const errors = [
      { code: 'INSUFFICIENT_FUNDS', detail: 'Insufficient funds' },
    ];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Insufficient funds. Please try a different payment method.'
    );
  });

  it('should return user-friendly message for INVALID_EXPIRATION', () => {
    const errors = [{ code: 'INVALID_EXPIRATION' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'The card expiration date is invalid. Please check your card details.'
    );
  });

  it('should return user-friendly message for ADDRESS_VERIFICATION_FAILURE', () => {
    const errors = [{ code: 'ADDRESS_VERIFICATION_FAILURE' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'The billing address does not match the card on file. Please verify your address.'
    );
  });

  it('should return user-friendly message for CARD_EXPIRED', () => {
    const errors = [{ code: 'CARD_EXPIRED' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your card has expired. Please use a different card.'
    );
  });

  it('should return user-friendly message for CARD_TOKEN_EXPIRED', () => {
    const errors = [{ code: 'CARD_TOKEN_EXPIRED' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your payment session has expired. Please refresh the page and try again.'
    );
  });

  it('should fall back to Square detail message for unknown error codes', () => {
    const errors = [
      { code: 'SOME_UNKNOWN_CODE', detail: 'Something specific happened' },
    ];
    expect(getPaymentErrorMessage(errors)).toBe('Something specific happened');
  });

  it('should return generic message when no detail and no known code', () => {
    const errors = [{ code: 'SOME_UNKNOWN_CODE' }];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Unable to process payment. Please try again or use a different card.'
    );
  });

  it('should check all errors in array for known codes', () => {
    const errors = [
      { code: 'SOME_OTHER_ERROR' },
      { code: 'CARD_DECLINED' },
    ];
    expect(getPaymentErrorMessage(errors)).toBe(
      'Your card was declined. Please try a different card.'
    );
  });
});

describe('PaymentError', () => {
  it('should store user message and square error code', () => {
    const error = new PaymentError('Your card was declined.', 'CARD_DECLINED');
    expect(error.message).toBe('Your card was declined.');
    expect(error.userMessage).toBe('Your card was declined.');
    expect(error.squareErrorCode).toBe('CARD_DECLINED');
    expect(error.name).toBe('PaymentError');
  });

  it('should be an instance of Error', () => {
    const error = new PaymentError('Test message');
    expect(error).toBeInstanceOf(Error);
  });
});
