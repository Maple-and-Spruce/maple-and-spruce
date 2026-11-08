import { describe, it, expect, vi, beforeEach } from 'vitest';

const findByGiftCardId = vi.hoisted(() => vi.fn());

vi.mock('@maple/firebase/database', () => ({
  GiftCardPurchaseRepository: { findByGiftCardId },
}));

vi.mock('@maple/firebase/square', () => {
  class PaymentError extends Error {
    constructor(
      public readonly userMessage: string,
      public readonly squareErrorCode?: string
    ) {
      super(userMessage);
      this.name = 'PaymentError';
    }
  }
  return { PaymentError };
});

import {
  chargeWithGiftCard,
  classCertificateCoverCents,
  giftCardIdempotencyKeys,
  readUsableGiftCard,
  type UsableGiftCard,
} from './gift-card-payment';

const activeCard = {
  id: 'gc-1',
  last4: '4821',
  kind: 'egift' as const,
  state: 'active' as const,
  balanceCents: 6000,
  createdAt: '2026-11-01T00:00:00Z',
};

function makeSquare() {
  return {
    locationId: 'L',
    giftCardsService: { getGiftCardFromNonce: vi.fn() },
    paymentsService: {
      createPayment: vi.fn(),
      cancelPayment: vi.fn().mockResolvedValue(undefined),
      cancelPaymentByIdempotencyKey: vi.fn().mockResolvedValue(undefined),
    },
    ordersService: {
      payOrder: vi.fn().mockResolvedValue({ orderId: 'order-1', state: 'COMPLETED' }),
    },
  };
}

function payment(id: string, amountCents: number, receiptUrl?: string) {
  return { paymentId: id, status: 'APPROVED', amountCents, totalCents: amountCents, receiptUrl };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('readUsableGiftCard', () => {
  it('returns the card and its purchase record', async () => {
    const square = makeSquare();
    square.giftCardsService.getGiftCardFromNonce.mockResolvedValue(activeCard);
    findByGiftCardId.mockResolvedValue({ kind: 'class', valueCents: 5000 });

    const result = await readUsableGiftCard(square as never, 'gftok:abc');

    expect(square.giftCardsService.getGiftCardFromNonce).toHaveBeenCalledWith('gftok:abc');
    expect(findByGiftCardId).toHaveBeenCalledWith('gc-1');
    expect(result.card).toBe(activeCard);
    expect(result.purchase).toEqual({ kind: 'class', valueCents: 5000 });
  });

  it('refuses an unknown card in plain words', async () => {
    const square = makeSquare();
    square.giftCardsService.getGiftCardFromNonce.mockResolvedValue(undefined);
    await expect(readUsableGiftCard(square as never, 'x')).rejects.toThrow(
      "couldn't find that gift card"
    );
    expect(findByGiftCardId).not.toHaveBeenCalled();
  });

  it('refuses an empty card', async () => {
    const square = makeSquare();
    square.giftCardsService.getGiftCardFromNonce.mockResolvedValue({
      ...activeCard,
      balanceCents: 0,
    });
    await expect(readUsableGiftCard(square as never, 'x')).rejects.toThrow(
      'no money left'
    );
  });

  it('refuses a card that is not active', async () => {
    const square = makeSquare();
    square.giftCardsService.getGiftCardFromNonce.mockResolvedValue({
      ...activeCard,
      state: 'deactivated',
    });
    await expect(readUsableGiftCard(square as never, 'x')).rejects.toThrow(
      'turned off'
    );
  });

  it('refuses a blank token without calling Square', async () => {
    const square = makeSquare();
    await expect(readUsableGiftCard(square as never, '  ')).rejects.toThrow(
      'Gift card is required'
    );
    expect(square.giftCardsService.getGiftCardFromNonce).not.toHaveBeenCalled();
  });
});

describe('classCertificateCoverCents', () => {
  const certificate = (balanceCents: number): UsableGiftCard => ({
    card: { ...activeCard, balanceCents },
    purchase: {
      kind: 'class',
      valueCents: 5000,
      classCategoryId: 'pottery',
    } as UsableGiftCard['purchase'],
  });

  it('covers the shortfall up to 10% for a class of the same kind', () => {
    expect(
      classCertificateCoverCents({
        giftCard: certificate(5000),
        classEntity: { categoryId: 'pottery', priceCents: 5300 },
        subtotalCents: 5300,
      })
    ).toBe(300);
    expect(
      classCertificateCoverCents({
        giftCard: certificate(5000),
        classEntity: { categoryId: 'pottery', priceCents: 6500 },
        subtotalCents: 6500,
      })
    ).toBe(500);
  });

  it('covers nothing for another kind of class', () => {
    expect(
      classCertificateCoverCents({
        giftCard: certificate(5000),
        classEntity: { categoryId: 'weaving', priceCents: 5300 },
        subtotalCents: 5300,
      })
    ).toBe(0);
  });

  it('covers nothing for a dollar gift card', () => {
    expect(
      classCertificateCoverCents({
        giftCard: { card: activeCard },
        classEntity: { categoryId: 'pottery', priceCents: 9000 },
        subtotalCents: 9000,
      })
    ).toBe(0);
  });

  it('measures one seat, not every seat on the order', () => {
    expect(
      classCertificateCoverCents({
        giftCard: certificate(5000),
        classEntity: { categoryId: 'pottery', priceCents: 5000 },
        subtotalCents: 10000,
      })
    ).toBe(0);
  });
});

describe('giftCardIdempotencyKeys', () => {
  it('derives stable keys under Square’s 45 character limit', () => {
    const keys = giftCardIdempotencyKeys('a'.repeat(20));
    expect(giftCardIdempotencyKeys('a'.repeat(20))).toEqual(keys);
    for (const key of Object.values(keys)) expect(key.length).toBeLessThanOrEqual(45);
    expect(new Set(Object.values(keys)).size).toBe(4);
  });
});

describe('chargeWithGiftCard', () => {
  const base = {
    registrationId: 'reg-1',
    orderId: 'order-1',
    giftCardNonce: 'gftok:abc',
    buyerEmailAddress: 'robin@example.com',
    note: 'Registration',
  };

  it('pays the whole order from the gift card when it covers it', async () => {
    const square = makeSquare();
    square.paymentsService.createPayment.mockResolvedValue(
      payment('gc-pay', 5300, 'https://receipt/gc')
    );

    const result = await chargeWithGiftCard({
      ...base,
      square: square as never,
      orderTotalCents: 5300,
      giftCard: { card: activeCard },
      cardNonce: '',
    });

    expect(square.paymentsService.createPayment).toHaveBeenCalledTimes(1);
    expect(square.paymentsService.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'gc-1',
        amountCents: 5300,
        orderId: 'order-1',
        autocomplete: false,
        acceptPartialAuthorization: true,
        idempotencyKey: 'gcp-reg-1',
      })
    );
    expect(square.ordersService.payOrder).toHaveBeenCalledWith({
      orderId: 'order-1',
      paymentIds: ['gc-pay'],
      idempotencyKey: 'gpo-reg-1',
    });
    expect(result).toEqual({
      giftCardPaymentId: 'gc-pay',
      giftCardPaidCents: 5300,
      cardPaymentId: undefined,
      cardPaidCents: 0,
      receiptUrl: 'https://receipt/gc',
    });
  });

  it('splits between gift card and card', async () => {
    const square = makeSquare();
    square.paymentsService.createPayment
      .mockResolvedValueOnce(payment('gc-pay', 6000))
      .mockResolvedValueOnce(payment('card-pay', 3540, 'https://receipt/card'));

    const result = await chargeWithGiftCard({
      ...base,
      square: square as never,
      orderTotalCents: 9540,
      giftCard: { card: activeCard },
      cardNonce: 'cnon:card',
    });

    expect(square.paymentsService.createPayment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ amountCents: 6000, sourceId: 'gc-1' })
    );
    expect(square.paymentsService.createPayment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sourceId: 'cnon:card',
        amountCents: 3540,
        autocomplete: false,
        orderId: 'order-1',
        idempotencyKey: 'gcc-reg-1',
      })
    );
    expect(square.ordersService.payOrder).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIds: ['gc-pay', 'card-pay'] })
    );
    expect(result).toMatchObject({
      giftCardPaidCents: 6000,
      cardPaymentId: 'card-pay',
      cardPaidCents: 3540,
      receiptUrl: 'https://receipt/card',
    });
  });

  it('charges the card for whatever Square did not approve on the gift card', async () => {
    const square = makeSquare();
    // The card was spent down between reading it and charging it.
    square.paymentsService.createPayment
      .mockResolvedValueOnce(payment('gc-pay', 1000))
      .mockResolvedValueOnce(payment('card-pay', 4300));

    const result = await chargeWithGiftCard({
      ...base,
      square: square as never,
      orderTotalCents: 5300,
      giftCard: { card: activeCard },
      cardNonce: 'cnon:card',
    });

    expect(square.paymentsService.createPayment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ amountCents: 4300 })
    );
    expect(result.giftCardPaidCents).toBe(1000);
    expect(result.cardPaidCents).toBe(4300);
  });

  it('cancels the gift card payment when the card is declined', async () => {
    const square = makeSquare();
    const declined = Object.assign(new Error('Your card was declined.'), {
      name: 'PaymentError',
    });
    square.paymentsService.createPayment
      .mockResolvedValueOnce(payment('gc-pay', 6000))
      .mockRejectedValueOnce(declined);

    await expect(
      chargeWithGiftCard({
        ...base,
        square: square as never,
        orderTotalCents: 9540,
        giftCard: { card: activeCard },
        cardNonce: 'cnon:card',
      })
    ).rejects.toBe(declined);

    expect(square.paymentsService.cancelPaymentByIdempotencyKey).toHaveBeenCalledWith(
      'gcc-reg-1'
    );
    expect(square.paymentsService.cancelPayment).toHaveBeenCalledWith('gc-pay');
    expect(square.ordersService.payOrder).not.toHaveBeenCalled();
  });

  it('cancels both payments when paying the order fails', async () => {
    const square = makeSquare();
    square.paymentsService.createPayment
      .mockResolvedValueOnce(payment('gc-pay', 6000))
      .mockResolvedValueOnce(payment('card-pay', 3540));
    square.ordersService.payOrder.mockRejectedValue(new Error('pay failed'));

    await expect(
      chargeWithGiftCard({
        ...base,
        square: square as never,
        orderTotalCents: 9540,
        giftCard: { card: activeCard },
        cardNonce: 'cnon:card',
      })
    ).rejects.toThrow('pay failed');

    expect(square.paymentsService.cancelPayment).toHaveBeenCalledWith('gc-pay');
    expect(square.paymentsService.cancelPayment).toHaveBeenCalledWith('card-pay');
  });

  it('still reports the original failure when a cancel fails', async () => {
    const square = makeSquare();
    square.paymentsService.createPayment
      .mockResolvedValueOnce(payment('gc-pay', 6000))
      .mockRejectedValueOnce(new Error('declined'));
    square.paymentsService.cancelPayment.mockRejectedValue(new Error('cancel broke'));

    await expect(
      chargeWithGiftCard({
        ...base,
        square: square as never,
        orderTotalCents: 9540,
        giftCard: { card: activeCard },
        cardNonce: 'cnon:card',
      })
    ).rejects.toThrow('declined');
  });

  it('voids by key when the gift card payment itself fails', async () => {
    const square = makeSquare();
    square.paymentsService.createPayment.mockRejectedValue(new Error('timeout'));

    await expect(
      chargeWithGiftCard({
        ...base,
        square: square as never,
        orderTotalCents: 5300,
        giftCard: { card: activeCard },
      })
    ).rejects.toThrow('timeout');
    expect(square.paymentsService.cancelPaymentByIdempotencyKey).toHaveBeenCalledWith(
      'gcp-reg-1'
    );
  });

  it('refuses before charging anything when a card is needed and none was sent', async () => {
    const square = makeSquare();
    await expect(
      chargeWithGiftCard({
        ...base,
        square: square as never,
        orderTotalCents: 9540,
        giftCard: { card: activeCard },
        cardNonce: '  ',
      })
    ).rejects.toThrow('Please enter a card for the rest');
    expect(square.paymentsService.createPayment).not.toHaveBeenCalled();
  });

  it('cancels the gift card when it was approved for less and no card was sent', async () => {
    const square = makeSquare();
    square.paymentsService.createPayment.mockResolvedValueOnce(payment('gc-pay', 1000));

    await expect(
      chargeWithGiftCard({
        ...base,
        square: square as never,
        orderTotalCents: 5300,
        giftCard: { card: activeCard },
      })
    ).rejects.toThrow('Please enter a card for the rest');
    expect(square.paymentsService.cancelPayment).toHaveBeenCalledWith('gc-pay');
  });

  it('refuses a card with no balance', async () => {
    const square = makeSquare();
    await expect(
      chargeWithGiftCard({
        ...base,
        square: square as never,
        orderTotalCents: 5300,
        giftCard: { card: { ...activeCard, balanceCents: 0 } },
      })
    ).rejects.toThrow('no money left');
    expect(square.paymentsService.createPayment).not.toHaveBeenCalled();
  });
});
