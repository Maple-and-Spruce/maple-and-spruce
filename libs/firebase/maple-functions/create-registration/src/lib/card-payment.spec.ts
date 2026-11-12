import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentError } from '@maple/firebase/square';
import { cardIdempotencyKeys, chargeCard } from './card-payment';

const input = {
  sourceId: 'cnon:card-nonce-ok',
  amountCents: 5300,
  idempotencyKey: cardIdempotencyKeys('reg123').payment,
  locationId: 'L1',
  referenceId: 'reg123',
};
const paid = {
  paymentId: 'pay_1',
  status: 'COMPLETED',
  totalCents: 5300,
  amountCents: 5300,
};

function squareWith(createPayment: ReturnType<typeof vi.fn>) {
  const cancelPaymentByIdempotencyKey = vi.fn(async () => undefined);
  return {
    square: { paymentsService: { createPayment, cancelPaymentByIdempotencyKey } },
    cancelPaymentByIdempotencyKey,
  };
}

describe('chargeCard', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('uses one key per registration, so a retry is the same payment', () => {
    expect(cardIdempotencyKeys('reg123')).toEqual({
      order: 'order-reg123',
      payment: 'reg-reg123',
    });
    // Firestore ids are 20 characters; Square allows 45.
    expect(
      cardIdempotencyKeys('a'.repeat(20)).order.length
    ).toBeLessThanOrEqual(45);
  });

  it('charges once when Square answers', async () => {
    const createPayment = vi.fn(async () => paid);
    const { square } = squareWith(createPayment);
    await expect(chargeCard(square as never, input)).resolves.toEqual(paid);
    expect(createPayment).toHaveBeenCalledTimes(1);
  });

  it('does not retry a decline', async () => {
    const declined = new PaymentError('Your card was declined.', 'CARD_DECLINED');
    const createPayment = vi.fn(async () => {
      throw declined;
    });
    const { square, cancelPaymentByIdempotencyKey } = squareWith(createPayment);
    await expect(chargeCard(square as never, input)).rejects.toBe(declined);
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(cancelPaymentByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('asks again with the same key when the outcome is unknown, and takes the answer', async () => {
    const createPayment = vi
      .fn()
      .mockRejectedValueOnce(new PaymentError('generic'))
      .mockResolvedValueOnce(paid);
    const { square, cancelPaymentByIdempotencyKey } = squareWith(createPayment);
    await expect(chargeCard(square as never, input)).resolves.toEqual(paid);
    expect(createPayment).toHaveBeenCalledTimes(2);
    expect(createPayment.mock.calls[1][0].idempotencyKey).toBe(
      createPayment.mock.calls[0][0].idempotencyKey
    );
    expect(cancelPaymentByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('reports the decline when the second ask is refused', async () => {
    const declined = new PaymentError('Your card was declined.', 'CARD_DECLINED');
    const createPayment = vi
      .fn()
      .mockRejectedValueOnce(new PaymentError('generic', 'GATEWAY_TIMEOUT'))
      .mockRejectedValueOnce(declined);
    const { square, cancelPaymentByIdempotencyKey } = squareWith(createPayment);
    await expect(chargeCard(square as never, input)).rejects.toBe(declined);
    expect(cancelPaymentByIdempotencyKey).not.toHaveBeenCalled();
  });

  it('voids by key and rethrows when it is still unknown', async () => {
    const createPayment = vi.fn(async () => {
      throw new PaymentError('generic');
    });
    const { square, cancelPaymentByIdempotencyKey } = squareWith(createPayment);
    await expect(chargeCard(square as never, input)).rejects.toBeInstanceOf(
      PaymentError
    );
    expect(createPayment).toHaveBeenCalledTimes(2);
    expect(cancelPaymentByIdempotencyKey).toHaveBeenCalledWith('reg-reg123');
  });
});
