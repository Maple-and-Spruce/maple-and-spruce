/**
 * A small stand-in for Square's Web Payments SDK on `window.Square`, for
 * stories. With it the real `SquareCardForm` runs: the card and gift card
 * fields are plain inputs and tokenizing returns fixed tokens.
 * `SquareCardForm` skips loading square.js when `window.Square` is already
 * there. Call it from a story's `beforeEach`; it returns the clean-up.
 */

type FakeField = {
  attach: (el: HTMLElement) => Promise<void>;
  tokenize: () => Promise<{ status: 'OK'; token: string }>;
  destroy: () => Promise<void>;
};

/** Each tokenize gives a new token, as Square's does (`<prefix>-1`, `-2`, …). */
function fakeField(label: string, tokenPrefix: string): FakeField {
  let tokens = 0;
  let input: HTMLInputElement | null = null;
  return {
    attach: async (el) => {
      input = document.createElement('input');
      input.setAttribute('aria-label', label);
      input.placeholder = label;
      input.style.cssText =
        'width:100%;box-sizing:border-box;height:48px;padding:0 12px;border:1px solid rgba(0,0,0,0.23);border-radius:6px;font-size:16px';
      el.replaceChildren(input);
    },
    tokenize: async () => {
      tokens += 1;
      return { status: 'OK', token: `${tokenPrefix}-${tokens}` };
    },
    destroy: async () => {
      input?.remove();
    },
  };
}

export function installFakeSquare(): () => void {
  const w = window as unknown as { Square?: unknown };
  const previous = w.Square;
  // One gift card "number" per story, whichever field object reads it.
  const giftCardField = fakeField('Gift card number', 'gift-token');
  w.Square = {
    payments: async () => ({
      card: async () => fakeField('Card number', 'card-token'),
      giftCard: async () => giftCardField,
      paymentRequest: () => ({ update: () => undefined }),
      googlePay: async () => {
        throw new Error('Google Pay is not available here');
      },
      verifyBuyer: async () => ({ token: 'verify-token' }),
    }),
  };
  return () => {
    w.Square = previous;
  };
}
