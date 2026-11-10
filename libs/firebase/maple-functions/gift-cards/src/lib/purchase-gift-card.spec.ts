import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const square = vi.hoisted(() => ({
  locationId: 'LOC-1',
  ordersService: { createOrder: vi.fn() },
  paymentsService: { createPayment: vi.fn(), refundPayment: vi.fn() },
  giftCardsService: { createDigitalGiftCard: vi.fn(), activateGiftCard: vi.fn() },
}));

vi.mock('@maple/firebase/square', () => {
  class PaymentError extends Error {
    constructor(
      public readonly userMessage: string,
      public readonly squareErrorCode?: string
    ) {
      super(userMessage);
    }
  }
  return {
    PaymentError,
    isGiftCardCodeTakenError: vi.fn(() => false),
    Square: vi.fn().mockImplementation(function () {
      return square;
    }),
  };
});

const repos = vi.hoisted(() => ({
  ClassRepository: { findById: vi.fn() },
  ClassCategoryRepository: { findById: vi.fn() },
  GiftCardSettingsRepository: { get: vi.fn() },
  GiftCardPurchaseRepository: { create: vi.fn(), findByGiftCardId: vi.fn() },
}));
vi.mock('@maple/firebase/database', () => repos);

const queueMail = vi.hoisted(() => vi.fn());
vi.mock('@maple/firebase/functions', () => ({
  queueMail,
  throwInvalidArgument: (message: string) => {
    throw Object.assign(new Error(message), { code: 'invalid-argument' });
  },
  throwValidationError: (errors: Record<string, string[]>) => {
    throw Object.assign(new Error(Object.keys(errors).join(',')), {
      code: 'invalid-argument',
    });
  },
}));

import { isGiftCardCodeTakenError, PaymentError } from '@maple/firebase/square';
import type { PurchaseGiftCardRequest } from '@maple/ts/firebase/api-types';
import {
  giftCardPurchaseKeys,
  purchaseCardKey,
  purchaseCodeRandom,
  purchaseGiftCard,
} from './purchase-gift-card';

/** The MAPLE code the purchase gave its card (read back from the Square call). */
function madeCode(): string {
  const call = square.giftCardsService.createDigitalGiftCard.mock.calls.at(-1);
  return call?.[0]?.gan ?? 'MAPLE-not-made';
}
const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = {
  SQUARE_ENV: 'LOCAL',
  SQUARE_LOCATION_ID: 'LOC-1',
  SALES_TAX_RATE: '6',
  ADMIN_ALERT_EMAIL: 'alerts@example.com',
};

const amountRequest: PurchaseGiftCardRequest = {
  kind: 'amount',
  amountCents: 5000,
  buyerName: ' Robin Ashfield ',
  buyerEmail: 'robin@example.com',
  recipientName: 'Olive Thompson',
  recipientEmail: 'olive@example.com',
  message: 'Happy birthday!',
  deliverTo: 'recipient',
  sourceId: 'cnon:card-nonce-ok',
  idempotencyKey: 'client-key-0001',
};

const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
const potteryClass = {
  id: 'class-1',
  name: 'Beginner Wheel',
  status: 'published',
  categoryId: 'cat-pottery',
  priceCents: 6500,
  sessions: [{ dateTime: future }],
  durationMinutes: 120,
  capacity: 8,
};

const potteryType = {
  id: 'cat-pottery',
  name: 'Pottery',
  order: 0,
  giftCertificateEnabled: true,
  giftCertificatePriceCents: 7000,
};

function happySquare(totalCents = 5000): void {
  square.ordersService.createOrder.mockResolvedValue({
    orderId: 'order-1',
    totalCents,
    taxCents: 0,
    lineItems: [{ uid: 'line-1', name: 'Gift card', itemType: 'GIFT_CARD' }],
  });
  square.paymentsService.createPayment.mockResolvedValue({
    paymentId: 'pay-1',
    status: 'COMPLETED',
    totalCents,
  });
  // As Square does: the card takes the code it is given. A MAPLE code's last 4
  // are never shown, so the service reports none (see giftCardLast4).
  square.giftCardsService.createDigitalGiftCard.mockImplementation(
    async ({ gan }: { gan: string }) => ({ id: 'gc-1', gan, last4: '' })
  );
  square.giftCardsService.activateGiftCard.mockResolvedValue({ balanceCents: totalCents });
}

let logs: string[];
beforeEach(() => {
  vi.clearAllMocks();
  logs = [];
  const capture = (...args: unknown[]) => {
    logs.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  };
  vi.spyOn(console, 'log').mockImplementation(capture);
  vi.spyOn(console, 'error').mockImplementation(capture);
  repos.GiftCardSettingsRepository.get.mockResolvedValue({
    presetCents: [2500, 5000, 10000],
    minCents: 1000,
    maxCents: 50000,
  });
  repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue(undefined);
  repos.GiftCardPurchaseRepository.create.mockImplementation(async (p) => p);
  queueMail.mockResolvedValue(true);
});
afterEach(() => vi.restoreAllMocks());

describe('giftCardPurchaseKeys', () => {
  it('derives stable keys within Square limits', () => {
    const a = giftCardPurchaseKeys('client-key-0001');
    const b = giftCardPurchaseKeys('client-key-0001');
    expect(a).toEqual(b);
    expect(a.payment.length).toBeLessThanOrEqual(45);
    expect(a.refund.length).toBeLessThanOrEqual(45);
    expect(a.referenceId.length).toBeLessThanOrEqual(40);
    expect(a.referenceId).toMatch(/^giftcard-/);
    expect(giftCardPurchaseKeys('client-key-0002').payment).not.toBe(a.payment);
  });
});

describe('purchaseGiftCard', () => {
  it('sells a dollar card: order, payment, card, activation, record, emails', async () => {
    happySquare();
    const keys = giftCardPurchaseKeys(amountRequest.idempotencyKey);

    const result = await purchaseGiftCard(amountRequest, {}, secrets, strings);

    expect(result).toEqual({
      giftCardId: 'gc-1',
      last4: '',
      kind: 'amount',
      valueCents: 5000,
      className: undefined,
      deliverTo: 'recipient',
      sentTo: 'olive@example.com',
    });
    expect(square.ordersService.createOrder).toHaveBeenCalledWith({
      locationId: 'LOC-1',
      idempotencyKey: keys.order,
      referenceId: keys.referenceId,
      lineItems: [
        { name: 'Gift card', quantity: '1', basePriceCents: 5000, itemType: 'GIFT_CARD' },
      ],
      taxes: [],
    });
    expect(square.paymentsService.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'cnon:card-nonce-ok',
        amountCents: 5000,
        idempotencyKey: keys.payment,
        orderId: 'order-1',
        buyerEmailAddress: 'robin@example.com',
        referenceId: keys.referenceId,
      })
    );
    expect(square.giftCardsService.activateGiftCard).toHaveBeenCalledWith({
      giftCardId: 'gc-1',
      locationId: 'LOC-1',
      orderId: 'order-1',
      lineItemUid: 'line-1',
      idempotencyKey: keys.activate,
    });
    expect(repos.GiftCardPurchaseRepository.create).toHaveBeenCalledWith({
      giftCardId: 'gc-1',
      last4: '',
      kind: 'amount',
      valueCents: 5000,
      classId: undefined,
      classCategoryId: undefined,
      className: undefined,
      buyerName: 'Robin Ashfield',
      buyerEmail: 'robin@example.com',
      recipientName: 'Olive Thompson',
      recipientEmail: 'olive@example.com',
      message: 'Happy birthday!',
      deliverTo: 'recipient',
      squareOrderId: 'order-1',
      squarePaymentId: 'pay-1',
    });
    // The record never holds the full code.
    expect(madeCode()).toMatch(/^MAPLE\d{7}$/);
    expect(JSON.stringify(repos.GiftCardPurchaseRepository.create.mock.calls)).not.toContain(
      madeCode()
    );
  });

  it('emails the code to the recipient and none of it to the buyer', async () => {
    happySquare();
    await purchaseGiftCard(amountRequest, {}, secrets, strings);

    expect(queueMail).toHaveBeenCalledTimes(2);
    const [gift, confirmation] = queueMail.mock.calls.map((c) => c[0]);
    expect(gift).toMatchObject({
      to: 'olive@example.com',
      templateName: 'gift-card',
      sender: 'maple-spruce',
      data: {
        recipientName: 'Olive Thompson',
        forBuyer: false,
        buyerName: 'Robin Ashfield',
        description: '$50',
        isClass: false,
        code: expect.stringMatching(/^MAPLE \d{4} \d{3}$/),
        message: 'Happy birthday!',
      },
    });
    expect(confirmation).toMatchObject({
      to: 'robin@example.com',
      templateName: 'gift-card-purchase-confirmation',
      data: { last4: '', recipientEmail: 'olive@example.com' },
    });
    expect(JSON.stringify(confirmation)).not.toContain('7783');
  });

  it('sends one email with the code to the buyer when it is for them to print', async () => {
    happySquare();
    const result = await purchaseGiftCard(
      { ...amountRequest, deliverTo: 'buyer', recipientEmail: undefined },
      {},
      secrets,
      strings
    );

    expect(result.sentTo).toBe('robin@example.com');
    expect(queueMail).toHaveBeenCalledTimes(1);
    expect(queueMail.mock.calls[0][0]).toMatchObject({
      to: 'robin@example.com',
      templateName: 'gift-card',
      data: { forBuyer: true, giftFor: 'Olive Thompson', recipientName: undefined },
    });
  });

  it('never logs the full code', async () => {
    happySquare();
    await purchaseGiftCard(amountRequest, {}, secrets, strings);
    expect(logs.join('\n')).toContain('gift_card_purchased');
    expect(logs.join('\n')).not.toContain(madeCode());
  });

  it('prices a class certificate from its type and records the type (#309)', async () => {
    happySquare(7000);
    repos.ClassCategoryRepository.findById.mockResolvedValue(potteryType);

    const result = await purchaseGiftCard(
      { ...amountRequest, kind: 'class', classCategoryId: 'cat-pottery' } as PurchaseGiftCardRequest,
      {},
      secrets,
      strings
    );

    expect(repos.ClassRepository.findById).not.toHaveBeenCalled();
    expect(result).toMatchObject({ kind: 'class', valueCents: 7000, className: 'Pottery' });
    expect(square.ordersService.createOrder.mock.calls[0][0].lineItems[0]).toEqual({
      name: 'Gift certificate: Pottery class',
      quantity: '1',
      basePriceCents: 7000,
      itemType: 'GIFT_CARD',
    });
    const record = repos.GiftCardPurchaseRepository.create.mock.calls[0][0];
    expect(record).toMatchObject({
      kind: 'class',
      valueCents: 7000,
      classCategoryId: 'cat-pottery',
      className: 'Pottery',
    });
    expect(record.classId).toBeUndefined();
    expect(queueMail.mock.calls[0][0].data.description).toBe('One Pottery class at Maple & Spruce');
  });

  it("prices an old class link at its type's certificate price, not the class price", async () => {
    happySquare(7000);
    repos.ClassRepository.findById.mockResolvedValue(potteryClass);
    repos.ClassCategoryRepository.findById.mockResolvedValue(potteryType);

    const result = await purchaseGiftCard(
      { ...amountRequest, kind: 'class', classId: 'class-1' } as PurchaseGiftCardRequest,
      {},
      secrets,
      strings
    );

    expect(repos.ClassCategoryRepository.findById).toHaveBeenCalledWith('cat-pottery');
    expect(result.valueCents).toBe(7000);
    expect(repos.GiftCardPurchaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        classId: 'class-1',
        classCategoryId: 'cat-pottery',
        className: 'Pottery',
      })
    );
  });

  it('lets the type decide when both a type and a class are sent', async () => {
    happySquare(7000);
    repos.ClassCategoryRepository.findById.mockResolvedValue(potteryType);
    await purchaseGiftCard(
      {
        ...amountRequest,
        kind: 'class',
        classCategoryId: 'cat-pottery',
        classId: 'class-1',
      } as PurchaseGiftCardRequest,
      {},
      secrets,
      strings
    );
    expect(repos.ClassRepository.findById).not.toHaveBeenCalled();
    expect(repos.GiftCardPurchaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 'class-1', classCategoryId: 'cat-pottery' })
    );
  });

  it.each([
    ['missing', undefined],
    ['switched off', { ...potteryType, giftCertificateEnabled: false }],
    ['switched on without a price', { ...potteryType, giftCertificatePriceCents: undefined }],
  ])('refuses a class type that is %s, before Square', async (_label, type) => {
    repos.ClassCategoryRepository.findById.mockResolvedValue(type);
    await expect(
      purchaseGiftCard(
        { ...amountRequest, kind: 'class', classCategoryId: 'cat-pottery' } as PurchaseGiftCardRequest,
        {},
        secrets,
        strings
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(square.ordersService.createOrder).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['without a type', { ...potteryClass, categoryId: undefined }],
  ])('refuses an old class link to a class that is %s, before Square', async (_label, cls) => {
    repos.ClassRepository.findById.mockResolvedValue(cls);
    await expect(
      purchaseGiftCard(
        { ...amountRequest, kind: 'class', classId: 'class-1' } as PurchaseGiftCardRequest,
        {},
        secrets,
        strings
      )
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(square.ordersService.createOrder).not.toHaveBeenCalled();
  });

  it('refuses an old class link when its type is switched off', async () => {
    repos.ClassRepository.findById.mockResolvedValue(potteryClass);
    repos.ClassCategoryRepository.findById.mockResolvedValue({
      ...potteryType,
      giftCertificateEnabled: false,
    });
    await expect(
      purchaseGiftCard(
        { ...amountRequest, kind: 'class', classId: 'class-1' } as PurchaseGiftCardRequest,
        {},
        secrets,
        strings
      )
    ).rejects.toThrow('not available as a gift certificate');
    expect(square.ordersService.createOrder).not.toHaveBeenCalled();
  });

  it('enforces the amounts from Settings, not the shipped limits (#309)', async () => {
    repos.GiftCardSettingsRepository.get.mockResolvedValue({
      presetCents: [2000],
      minCents: 500,
      maxCents: 100000,
    });
    happySquare(75000);
    await expect(
      purchaseGiftCard({ ...amountRequest, amountCents: 75000 }, {}, secrets, strings)
    ).resolves.toMatchObject({ valueCents: 75000 });

    vi.clearAllMocks();
    repos.GiftCardSettingsRepository.get.mockResolvedValue({
      presetCents: [2000],
      minCents: 2000,
      maxCents: 20000,
    });
    await expect(
      purchaseGiftCard({ ...amountRequest, amountCents: 1000 }, {}, secrets, strings)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(square.ordersService.createOrder).not.toHaveBeenCalled();
  });

  it('refuses an invalid request before Square', async () => {
    await expect(
      purchaseGiftCard({ ...amountRequest, amountCents: 900 }, {}, secrets, strings)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(square.ordersService.createOrder).not.toHaveBeenCalled();
  });

  it('does not charge when the order total is not the card value', async () => {
    happySquare();
    square.ordersService.createOrder.mockResolvedValue({
      orderId: 'order-1',
      totalCents: 5300,
      taxCents: 300,
      lineItems: [{ uid: 'line-1', itemType: 'GIFT_CARD' }],
    });
    await expect(purchaseGiftCard(amountRequest, {}, secrets, strings)).rejects.toThrow(
      'We could not start your purchase'
    );
    expect(square.paymentsService.createPayment).not.toHaveBeenCalled();
  });

  it('passes a decline through and makes no card', async () => {
    happySquare();
    square.paymentsService.createPayment.mockRejectedValue(
      new PaymentError('Your card was declined. Please try a different card.', 'CARD_DECLINED')
    );
    await expect(purchaseGiftCard(amountRequest, {}, secrets, strings)).rejects.toThrow(
      'Your card was declined'
    );
    expect(square.giftCardsService.createDigitalGiftCard).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('gift_card_payment_failed');
  });

  it('wraps an unexpected payment error in a friendly message', async () => {
    happySquare();
    square.paymentsService.createPayment.mockRejectedValue(new Error('socket hang up'));
    await expect(purchaseGiftCard(amountRequest, {}, secrets, strings)).rejects.toThrow(
      'Unable to process payment'
    );
  });

  it('refunds the payment when the card cannot be activated', async () => {
    happySquare();
    square.giftCardsService.activateGiftCard.mockRejectedValue(
      new Error('Square could not activate gift card: bad line')
    );
    square.paymentsService.refundPayment.mockResolvedValue({
      refundId: 'ref-1',
      status: 'PENDING',
      amountCents: 5000,
    });

    await expect(purchaseGiftCard(amountRequest, {}, secrets, strings)).rejects.toThrow(
      'We could not create your gift card, so we refunded your payment'
    );
    expect(square.paymentsService.refundPayment).toHaveBeenCalledWith({
      paymentId: 'pay-1',
      amountCents: 5000,
      idempotencyKey: giftCardPurchaseKeys(amountRequest.idempotencyKey).refund,
      reason: 'Gift card could not be created',
    });
    expect(repos.GiftCardPurchaseRepository.create).not.toHaveBeenCalled();
    expect(queueMail).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('gift_card_purchase_refunded');
    expect(logs.join('\n')).not.toContain(madeCode());
  });

  it('refunds the payment when the card cannot be created', async () => {
    happySquare();
    square.giftCardsService.createDigitalGiftCard.mockRejectedValue(new Error('nope'));
    square.paymentsService.refundPayment.mockResolvedValue({
      refundId: 'ref-1',
      status: 'COMPLETED',
      amountCents: 5000,
    });
    await expect(purchaseGiftCard(amountRequest, {}, secrets, strings)).rejects.toThrow(
      'refunded your payment'
    );
    expect(square.giftCardsService.activateGiftCard).not.toHaveBeenCalled();
  });

  it('alerts staff when the refund fails too', async () => {
    happySquare();
    square.giftCardsService.activateGiftCard.mockRejectedValue(new Error('nope'));
    square.paymentsService.refundPayment.mockRejectedValue(new Error('refund down'));

    await expect(purchaseGiftCard(amountRequest, {}, secrets, strings)).rejects.toThrow();
    expect(logs.join('\n')).toContain('gift_card_refund_failed');
    expect(queueMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'alerts@example.com',
        templateName: 'gift-card-refund-needed',
        data: expect.objectContaining({ squarePaymentId: 'pay-1', amount: '$50' }),
      })
    );
  });

  it('does not email again when a retry finds the purchase already recorded', async () => {
    happySquare();
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue({ giftCardId: 'gc-1' });

    const result = await purchaseGiftCard(amountRequest, {}, secrets, strings);

    expect(result.giftCardId).toBe('gc-1');
    expect(repos.GiftCardPurchaseRepository.create).not.toHaveBeenCalled();
    expect(queueMail).not.toHaveBeenCalled();
  });

  it('still succeeds when the record or the emails fail after the card is live', async () => {
    happySquare();
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockRejectedValue(new Error('read down'));
    repos.GiftCardPurchaseRepository.create.mockRejectedValue(new Error('write down'));
    queueMail.mockRejectedValue(new Error('mail down'));

    const result = await purchaseGiftCard(amountRequest, {}, secrets, strings);

    expect(result.last4).toBe('');
    const all = logs.join('\n');
    expect(all).toContain('gift_card_purchase_record_failed');
    expect(all).toContain('gift_card_email_failed');
    expect(all).toContain('gift_card_confirmation_email_failed');
    expect(all).not.toContain(madeCode());
  });

  it('gives the card a MAPLE code, created with no money and loaded by the order', async () => {
    happySquare();
    const keys = giftCardPurchaseKeys(amountRequest.idempotencyKey);
    await purchaseGiftCard(amountRequest, {}, secrets, strings);

    const code = madeCode();
    expect(square.giftCardsService.createDigitalGiftCard).toHaveBeenCalledWith({
      locationId: 'LOC-1',
      idempotencyKey: purchaseCardKey(keys.card, code),
      gan: code,
    });
    expect(purchaseCardKey(keys.card, code)).not.toContain(code);
  });

  it('a retry tries the same code with the same key, so Square returns the same card', async () => {
    happySquare();
    await purchaseGiftCard(amountRequest, {}, secrets, strings);
    const first = square.giftCardsService.createDigitalGiftCard.mock.calls[0][0];

    await purchaseGiftCard(amountRequest, {}, secrets, strings);
    const second = square.giftCardsService.createDigitalGiftCard.mock.calls[1][0];

    expect(second).toEqual(first);
  });

  it('draws another code when Square already has a card with the first', async () => {
    happySquare();
    const taken = Object.assign(new Error('GAN already exists'), {
      errors: [{ code: 'GIFT_CARD_GAN_ALREADY_EXISTS' }],
    });
    vi.mocked(isGiftCardCodeTakenError).mockImplementation((e) => e === taken);
    square.giftCardsService.createDigitalGiftCard
      .mockRejectedValueOnce(taken)
      .mockImplementation(async ({ gan }: { gan: string }) => ({ id: 'gc-1', gan, last4: '' }));

    const result = await purchaseGiftCard(amountRequest, {}, secrets, strings);

    const calls = square.giftCardsService.createDigitalGiftCard.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0].gan).not.toBe(calls[0][0].gan);
    expect(calls[1][0].idempotencyKey).not.toBe(calls[0][0].idempotencyKey);
    expect(result.giftCardId).toBe('gc-1');
    expect(square.paymentsService.refundPayment).not.toHaveBeenCalled();
  });
});

describe('purchaseCodeRandom', () => {
  it('draws the same digits for the same key, and different ones for another key', () => {
    const draws = (key: string) => {
      const random = purchaseCodeRandom(key);
      return [random(1000), random(1000), random(1000)];
    };
    expect(draws('client-key-0001')).toEqual(draws('client-key-0001'));
    expect(draws('client-key-0001')).not.toEqual(draws('client-key-0002'));
    for (const n of draws('client-key-0003')) {
      expect(Number.isInteger(n) && n >= 0 && n < 1000).toBe(true);
    }
  });
});
