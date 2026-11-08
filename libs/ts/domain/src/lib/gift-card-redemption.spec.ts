import { describe, expect, it } from 'vitest';
import {
  certificateClassPriceCents,
  formatCentsAsDollars,
  giftCardRejectionMessage,
  registrationRefundParts,
  splitGiftCardPayment,
} from './gift-card-redemption';

describe('giftCardRejectionMessage', () => {
  it('accepts an active card with money on it', () => {
    expect(
      giftCardRejectionMessage({ state: 'active', balanceCents: 1 })
    ).toBeUndefined();
  });

  it('explains an unknown card', () => {
    expect(giftCardRejectionMessage(undefined)).toMatch(/couldn't find/);
  });

  it('explains an empty card', () => {
    expect(
      giftCardRejectionMessage({ state: 'active', balanceCents: 0 })
    ).toBe('This gift card has no money left on it.');
  });

  it.each([
    ['pending', /hasn't been turned on/],
    ['deactivated', /turned off/],
    ['blocked', /on hold/],
  ] as const)('explains a %s card', (state, message) => {
    expect(giftCardRejectionMessage({ state, balanceCents: 5000 })).toMatch(
      message
    );
  });
});

describe('certificateClassPriceCents', () => {
  it('is one seat when several are booked', () => {
    expect(
      certificateClassPriceCents({ unitPriceCents: 5500, subtotalCents: 11000 })
    ).toBe(5500);
  });

  it('is the discounted price when a code brings it below one seat', () => {
    expect(
      certificateClassPriceCents({ unitPriceCents: 5500, subtotalCents: 4400 })
    ).toBe(4400);
  });
});

describe('splitGiftCardPayment', () => {
  it('leaves nothing to pay when the card covers the total', () => {
    expect(
      splitGiftCardPayment({
        subtotalCents: 5000,
        taxRatePercent: 6,
        balanceCents: 10000,
        classCertificateCoverCents: 0,
      })
    ).toEqual({
      classCertificateCoverCents: 0,
      subtotalAfterCoverCents: 5000,
      taxAmountCents: 300,
      totalCents: 5300,
      giftCardAmountCents: 5300,
      leftToPayCents: 0,
    });
  });

  it('puts the rest on a card when the balance is short', () => {
    const split = splitGiftCardPayment({
      subtotalCents: 5000,
      taxRatePercent: 6,
      balanceCents: 2000,
      classCertificateCoverCents: 0,
    });
    expect(split.giftCardAmountCents).toBe(2000);
    expect(split.leftToPayCents).toBe(3300);
  });

  it('takes the certificate cover off before tax', () => {
    const split = splitGiftCardPayment({
      subtotalCents: 5500,
      taxRatePercent: 6,
      balanceCents: 5000,
      classCertificateCoverCents: 500,
    });
    expect(split.subtotalAfterCoverCents).toBe(5000);
    expect(split.taxAmountCents).toBe(300);
    expect(split.totalCents).toBe(5300);
    expect(split.giftCardAmountCents).toBe(5000);
    expect(split.leftToPayCents).toBe(300);
  });

  it('never covers more than the subtotal', () => {
    const split = splitGiftCardPayment({
      subtotalCents: 1000,
      taxRatePercent: 6,
      balanceCents: 0,
      classCertificateCoverCents: 5000,
    });
    expect(split.classCertificateCoverCents).toBe(1000);
    expect(split.totalCents).toBe(0);
  });
});

describe('registrationRefundParts', () => {
  it('is the one card payment for a registration paid without a gift card', () => {
    expect(
      registrationRefundParts({ pricePaidCents: 5300, squarePaymentId: 'p-1' })
    ).toEqual([{ paymentId: 'p-1', amountCents: 5300, kind: 'card' }]);
  });

  it('is nothing when nothing was paid through Square', () => {
    expect(registrationRefundParts({ pricePaidCents: 0 })).toEqual([]);
  });

  it('is the gift card payment alone when it paid everything', () => {
    expect(
      registrationRefundParts({
        pricePaidCents: 5300,
        squarePaymentId: 'gc-pay',
        squareGiftCardPaymentId: 'gc-pay',
        giftCardPaidCents: 5300,
      })
    ).toEqual([{ paymentId: 'gc-pay', amountCents: 5300, kind: 'gift-card' }]);
  });

  it('splits back to card and gift card', () => {
    expect(
      registrationRefundParts({
        pricePaidCents: 5300,
        squarePaymentId: 'card-pay',
        squareGiftCardPaymentId: 'gc-pay',
        giftCardPaidCents: 2000,
        cardPaidCents: 3300,
      })
    ).toEqual([
      { paymentId: 'card-pay', amountCents: 3300, kind: 'card' },
      { paymentId: 'gc-pay', amountCents: 2000, kind: 'gift-card' },
    ]);
  });

  it('works out the gift card share when it was not recorded', () => {
    expect(
      registrationRefundParts({
        pricePaidCents: 5300,
        squarePaymentId: 'card-pay',
        squareGiftCardPaymentId: 'gc-pay',
        cardPaidCents: 3300,
      })
    ).toEqual([
      { paymentId: 'card-pay', amountCents: 3300, kind: 'card' },
      { paymentId: 'gc-pay', amountCents: 2000, kind: 'gift-card' },
    ]);
  });
});

describe('formatCentsAsDollars', () => {
  it('formats cents', () => {
    expect(formatCentsAsDollars(600)).toBe('$6.00');
  });
});
