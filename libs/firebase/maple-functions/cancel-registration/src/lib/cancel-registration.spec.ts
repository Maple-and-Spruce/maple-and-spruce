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
  RegistrationRepository: { findById: mocks.findById, update: mocks.update },
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
    });
    expect(written.refundedAt).toBeInstanceOf(Date);
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
});
