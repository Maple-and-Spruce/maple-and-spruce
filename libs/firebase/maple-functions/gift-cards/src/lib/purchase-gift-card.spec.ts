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
    Square: vi.fn().mockImplementation(function () {
      return square;
    }),
  };
});

const repos = vi.hoisted(() => ({
  ClassRepository: { findById: vi.fn() },
  ClassCategoryRepository: { findById: vi.fn() },
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

import { PaymentError } from '@maple/firebase/square';
import type { PurchaseGiftCardRequest } from '@maple/ts/firebase/api-types';
import { giftCardPurchaseKeys, purchaseGiftCard } from './purchase-gift-card';

const CODE = '7783320000004242';
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
  square.giftCardsService.createDigitalGiftCard.mockResolvedValue({
    id: 'gc-1',
    gan: CODE,
    last4: '4242',
  });
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
      last4: '4242',
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
      last4: '4242',
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
    expect(JSON.stringify(repos.GiftCardPurchaseRepository.create.mock.calls)).not.toContain(
      CODE
    );
  });

  it('emails the code to the recipient and only the last 4 to the buyer', async () => {
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
        code: '7783 3200 0000 4242',
        message: 'Happy birthday!',
      },
    });
    expect(confirmation).toMatchObject({
      to: 'robin@example.com',
      templateName: 'gift-card-purchase-confirmation',
      data: { last4: '4242', recipientEmail: 'olive@example.com' },
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
    expect(logs.join('\n')).not.toContain(CODE);
  });

  it('prices a class certificate from the class and records its type', async () => {
    happySquare(6500);
    repos.ClassRepository.findById.mockResolvedValue(potteryClass);
    repos.ClassCategoryRepository.findById.mockResolvedValue({ id: 'cat-pottery', name: 'Pottery' });

    const result = await purchaseGiftCard(
      {
        ...amountRequest,
        kind: 'class',
        classId: 'class-1',
      } as PurchaseGiftCardRequest,
      {},
      secrets,
      strings
    );

    expect(result).toMatchObject({ kind: 'class', valueCents: 6500, className: 'Beginner Wheel' });
    expect(square.ordersService.createOrder.mock.calls[0][0].lineItems[0]).toEqual({
      name: 'Gift card: Beginner Wheel',
      quantity: '1',
      basePriceCents: 6500,
      itemType: 'GIFT_CARD',
    });
    expect(repos.GiftCardPurchaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'class',
        valueCents: 6500,
        classId: 'class-1',
        classCategoryId: 'cat-pottery',
        className: 'Beginner Wheel',
      })
    );
    expect(queueMail.mock.calls[0][0].data.description).toBe(
      'One Pottery class at Maple & Spruce (Beginner Wheel or any class of that type)'
    );
  });

  it('still sells a class certificate when the class type cannot be read', async () => {
    happySquare(6500);
    repos.ClassRepository.findById.mockResolvedValue(potteryClass);
    repos.ClassCategoryRepository.findById.mockRejectedValue(new Error('down'));
    const result = await purchaseGiftCard(
      { ...amountRequest, kind: 'class', classId: 'class-1' } as PurchaseGiftCardRequest,
      {},
      secrets,
      strings
    );
    expect(result.valueCents).toBe(6500);
  });

  it.each([
    ['missing', undefined],
    ['a draft', { ...potteryClass, status: 'draft' }],
    ['private hours', { ...potteryClass, format: 'privateHours' }],
    ['without a type', { ...potteryClass, categoryId: undefined }],
    ['free', { ...potteryClass, priceCents: 0 }],
  ])('refuses a class certificate for a class that is %s, before Square', async (_label, cls) => {
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
    expect(logs.join('\n')).not.toContain(CODE);
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

    expect(result.last4).toBe('4242');
    const all = logs.join('\n');
    expect(all).toContain('gift_card_purchase_record_failed');
    expect(all).toContain('gift_card_email_failed');
    expect(all).toContain('gift_card_confirmation_email_failed');
    expect(all).not.toContain(CODE);
  });
});
