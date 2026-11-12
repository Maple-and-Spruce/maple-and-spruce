import { describe, expect, it } from 'vitest';
import {
  CHECKOUT_BUSY_MESSAGE,
  CHECKOUT_FALLBACK_MESSAGE,
  CHECKOUT_UNCONFIRMED_MESSAGE,
  checkoutErrorMessage,
  mayAlreadyBePaid,
} from './checkout-error-message';

describe('checkoutErrorMessage', () => {
  it("shows the server's own sentence, without the status code", () => {
    expect(
      checkoutErrorMessage({
        code: 'functions/invalid-argument',
        message: 'Your card was declined. Please try a different card. [400]',
      })
    ).toBe('Your card was declined. Please try a different card.');
  });

  it.each(['unavailable', 'resource-exhausted', 'RESOURCE_EXHAUSTED'])(
    'says nothing was charged when the request was turned away (%s)',
    (word) => {
      expect(checkoutErrorMessage({ message: word })).toBe(
        CHECKOUT_BUSY_MESSAGE
      );
    }
  );

  it.each(['internal', 'INTERNAL', 'deadline-exceeded', 'cancelled'])(
    'asks the buyer to check their email when the answer never came (%s)',
    (word) => {
      expect(checkoutErrorMessage(new Error(word))).toBe(
        CHECKOUT_UNCONFIRMED_MESSAGE
      );
    }
  );

  it('keeps a throttle reply, which is a sentence and not a code word', () => {
    const message = 'Too many attempts. Please wait a few minutes and try again.';
    expect(
      checkoutErrorMessage({ code: 'functions/resource-exhausted', message })
    ).toBe(message);
  });

  it('goes by the code when there is no message', () => {
    expect(checkoutErrorMessage({ code: 'functions/unavailable' })).toBe(
      CHECKOUT_BUSY_MESSAGE
    );
  });

  it('falls back when it knows nothing', () => {
    expect(checkoutErrorMessage(undefined)).toBe(CHECKOUT_FALLBACK_MESSAGE);
    expect(checkoutErrorMessage({})).toBe(CHECKOUT_FALLBACK_MESSAGE);
    expect(checkoutErrorMessage({ message: 'unknown' })).toBe(
      CHECKOUT_FALLBACK_MESSAGE
    );
  });
});

describe('mayAlreadyBePaid', () => {
  it('is true when the payment could have gone through', () => {
    expect(mayAlreadyBePaid(CHECKOUT_UNCONFIRMED_MESSAGE)).toBe(true);
    expect(
      mayAlreadyBePaid('Your payment went through, but we could not finish.')
    ).toBe(true);
  });

  it('is false for a decline or a busy server', () => {
    expect(mayAlreadyBePaid('Your card was declined.')).toBe(false);
    expect(mayAlreadyBePaid(CHECKOUT_BUSY_MESSAGE)).toBe(false);
  });
});
