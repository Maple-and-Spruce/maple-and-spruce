import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for cancelRegistration. The Square round trip is covered by
 * apps/functions-integration-tests-square/src/cancel-registration.spec.ts;
 * here we pin down what gets written, in particular that a refund records
 * when it happened and how much, which instructor payouts depend on.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  update: vi.fn(),
  refundPayment: vi.fn(),
  markRefundedInSquare: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const fail = (message: string) => {
    throw new Error(message);
  };
  const chain = {
    usingSecrets: () => chain,
    usingStrings: () => chain,
    requiringRole: () => chain,
    handle: (handler: unknown) => handler,
  };
  return {
    Functions: { endpoint: chain },
    Role: { Admin: 'admin', Clerk: 'clerk' },
    throwFailedPrecondition: fail,
    throwInvalidArgument: fail,
    throwNotFound: (entity: string, id: string) => fail(`${entity} ${id} not found`),
  };
});

vi.mock('@maple/firebase/database', () => ({
  RegistrationRepository: {
    findById: mocks.findById,
    update: mocks.update,
    markRefundedInSquare: mocks.markRefundedInSquare,
  },
}));

vi.mock('@maple/firebase/square', () => ({
  SQUARE_SECRET_NAMES: [],
  SQUARE_STRING_NAMES: [],
  Square: class {
    paymentsService = { refundPayment: mocks.refundPayment };
  },
}));

import { cancelRegistration } from './cancel-registration';

type Handler = (data: unknown, ctx: unknown, secrets: unknown, strings: unknown) => Promise<unknown>;
const handler = cancelRegistration as unknown as Handler;
const call = (data: unknown) => handler(data, {}, {}, {});

const registration = {
  id: 'reg-1',
  status: 'confirmed',
  pricePaidCents: 5300,
  squarePaymentId: 'pay-1',
};

describe('cancelRegistration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findById.mockResolvedValue(registration);
    mocks.update.mockImplementation(async (input) => ({ ...registration, ...input }));
    mocks.refundPayment.mockResolvedValue({ refundId: 'refund-1', status: 'PENDING', amountCents: 5300 });
  });

  it('requires an id', async () => {
    await expect(call({})).rejects.toThrow('Registration ID is required');
  });

  it('rejects an unknown registration', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(call({ id: 'nope' })).rejects.toThrow('not found');
  });

  it('rejects a registration that is already cancelled or refunded', async () => {
    for (const status of ['cancelled', 'refunded']) {
      mocks.findById.mockResolvedValue({ ...registration, status });
      await expect(call({ id: 'reg-1' })).rejects.toThrow(`already ${status}`);
    }
  });

  it('cancels without touching refund fields when no refund is asked for', async () => {
    const result = await call({ id: 'reg-1' });
    expect(mocks.refundPayment).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ id: 'reg-1', status: 'cancelled' });
    expect(result).toMatchObject({ refundId: undefined });
  });

  it('records the time, amount and Square id of a refund', async () => {
    const before = Date.now();
    const result = await call({ id: 'reg-1', refund: true });

    expect(mocks.refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pay-1', amountCents: 5300 })
    );
    const written = mocks.update.mock.calls[0][0];
    expect(written).toMatchObject({
      id: 'reg-1',
      status: 'refunded',
      refundedAmountCents: 5300,
      squareRefundId: 'refund-1',
      // So the Square webhook's echo of this refund is a no-op (#144).
      squareRefundIds: ['refund-1'],
    });
    expect(written.refundedAt).toBeInstanceOf(Date);
    expect(written.lastRefundAt).toEqual(written.refundedAt);
    expect(written.refundedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(result).toMatchObject({ refundId: 'refund-1' });
  });

  it('falls back to the charged amount when Square omits the refund amount', async () => {
    mocks.refundPayment.mockResolvedValue({ refundId: 'refund-1', status: 'PENDING', amountCents: 0 });
    await call({ id: 'reg-1', refund: true });
    expect(mocks.update.mock.calls[0][0].refundedAmountCents).toBe(5300);
  });

  it('just cancels a free registration asked to refund', async () => {
    mocks.findById.mockResolvedValue({ ...registration, squarePaymentId: undefined });
    await call({ id: 'reg-1', refund: true });
    expect(mocks.refundPayment).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ id: 'reg-1', status: 'cancelled' });
  });

  it('refuses to refund a registration whose status cannot be refunded', async () => {
    mocks.findById.mockResolvedValue({ ...registration, status: 'pending' });
    await expect(call({ id: 'reg-1', refund: true })).rejects.toThrow("status 'pending'");
  });

  describe('refundedInSquare (#144)', () => {
    it('marks it refunded without calling Square', async () => {
      const flagged = { ...registration, source: 'pos', refundReviewAmountCents: 2000 };
      mocks.findById.mockResolvedValue(flagged);
      mocks.markRefundedInSquare.mockResolvedValue({ ...flagged, status: 'refunded' });

      const result = await call({ id: 'reg-1', refundedInSquare: true });

      expect(mocks.refundPayment).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
      expect(mocks.markRefundedInSquare).toHaveBeenCalledWith(flagged);
      expect(result).toEqual({ registration: { ...flagged, status: 'refunded' } });
    });

    it('rejects asking for a refund and already refunded together', async () => {
      await expect(
        call({ id: 'reg-1', refund: true, refundedInSquare: true })
      ).rejects.toThrow('not both');
      expect(mocks.findById).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean flag', async () => {
      await expect(call({ id: 'reg-1', refundedInSquare: 'yes' })).rejects.toThrow(
        'refundedInSquare must be true or false'
      );
    });

    it('still refuses a registration that is already refunded', async () => {
      mocks.findById.mockResolvedValue({ ...registration, status: 'refunded' });
      await expect(call({ id: 'reg-1', refundedInSquare: true })).rejects.toThrow(
        'already refunded'
      );
      expect(mocks.markRefundedInSquare).not.toHaveBeenCalled();
    });
  });
  describe('paid with a gift card (#301)', () => {
    const split = {
      ...registration,
      pricePaidCents: 5300,
      squarePaymentId: 'card-pay',
      squareGiftCardPaymentId: 'gc-pay',
      giftCardPaidCents: 2000,
      cardPaidCents: 3300,
      classCertificateCoverCents: 500,
    };

    it('refunds the card and the gift card each their own share', async () => {
      mocks.findById.mockResolvedValue(split);
      mocks.refundPayment
        .mockResolvedValueOnce({ refundId: 'rf-card', status: 'PENDING', amountCents: 3300 })
        .mockResolvedValueOnce({ refundId: 'rf-gc', status: 'PENDING', amountCents: 2000 });

      const result = await call({ id: 'reg-1', refund: true });

      expect(mocks.refundPayment).toHaveBeenNthCalledWith(1, {
        paymentId: 'card-pay',
        amountCents: 3300,
        idempotencyKey: 'refund-reg-1-card',
        reason: 'Registration cancelled by admin',
      });
      expect(mocks.refundPayment).toHaveBeenNthCalledWith(2, {
        paymentId: 'gc-pay',
        amountCents: 2000,
        idempotencyKey: 'refund-reg-1-gift-card',
        reason: 'Registration cancelled by admin',
      });
      // 5300 in all: the 500 certificate cover is never refunded as cash.
      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'reg-1',
          status: 'refunded',
          refundedAmountCents: 5300,
          squareRefundId: 'rf-card',
          squareRefundIds: ['rf-card', 'rf-gc'],
        })
      );
      expect(result).toMatchObject({ refundId: 'rf-card' });
    });

    it('refunds a registration the gift card paid for alone back onto the card', async () => {
      mocks.findById.mockResolvedValue({
        ...registration,
        squarePaymentId: 'gc-pay',
        squareGiftCardPaymentId: 'gc-pay',
        giftCardPaidCents: 5300,
        cardPaidCents: 0,
      });
      mocks.refundPayment.mockResolvedValue({ refundId: 'rf-gc', status: 'PENDING', amountCents: 5300 });

      await call({ id: 'reg-1', refund: true });

      expect(mocks.refundPayment).toHaveBeenCalledTimes(1);
      expect(mocks.refundPayment).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: 'gc-pay', amountCents: 5300 })
      );
    });

    it('records what went back and tells the admin when the second refund fails', async () => {
      mocks.findById.mockResolvedValue(split);
      mocks.refundPayment
        .mockResolvedValueOnce({ refundId: 'rf-card', status: 'PENDING', amountCents: 3300 })
        .mockRejectedValueOnce(new Error('Square refund error: boom'));

      await expect(call({ id: 'reg-1', refund: true })).rejects.toThrow(
        /\$33\.00 has been refunded so far\. The \$20\.00 refund to the gift card failed/
      );
      expect(mocks.update).toHaveBeenCalledTimes(1);
      const written = mocks.update.mock.calls[0][0];
      expect(written).toMatchObject({
        id: 'reg-1',
        refundedAmountCents: 3300,
        squareRefundIds: ['rf-card'],
      });
      expect(written.status).toBeUndefined();
    });

    it('does not count a refund twice when retried after a partial failure', async () => {
      mocks.findById.mockResolvedValue({
        ...split,
        refundedAmountCents: 3300,
        squareRefundIds: ['rf-card'],
      });
      mocks.refundPayment
        .mockResolvedValueOnce({ refundId: 'rf-card', status: 'COMPLETED', amountCents: 3300 })
        .mockResolvedValueOnce({ refundId: 'rf-gc', status: 'PENDING', amountCents: 2000 });

      await call({ id: 'reg-1', refund: true });

      expect(mocks.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'refunded',
          refundedAmountCents: 5300,
          squareRefundIds: ['rf-card', 'rf-gc'],
        })
      );
    });

    it('cancels without refunding when no refund is asked for', async () => {
      mocks.findById.mockResolvedValue(split);
      await call({ id: 'reg-1' });
      expect(mocks.refundPayment).not.toHaveBeenCalled();
      expect(mocks.update).toHaveBeenCalledWith({ id: 'reg-1', status: 'cancelled' });
    });

    it('refuses a status that cannot be refunded', async () => {
      mocks.findById.mockResolvedValue({ ...split, status: 'pending' });
      await expect(call({ id: 'reg-1', refund: true })).rejects.toThrow("status 'pending'");
    });
  });
});
