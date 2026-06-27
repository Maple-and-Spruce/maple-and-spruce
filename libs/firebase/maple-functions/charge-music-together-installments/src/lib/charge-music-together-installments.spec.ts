import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findDue: vi.fn(),
  tryClaimLease: vi.fn(),
  chargeUpdate: vi.fn(),
  regFindById: vi.fn(),
  mailAdd: vi.fn(),
  createPayment: vi.fn(),
}));

// Module-level trigger wiring must not blow up on import.
vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: vi.fn(() => 'scheduled-fn'),
}));
vi.mock('firebase-functions/params', () => ({
  defineSecret: (name: string) => ({ name, value: () => 'secret' }),
  defineString: (name: string) => ({ name, value: () => 'string' }),
}));
vi.mock('@maple/firebase/functions', () => {
  const endpoint = {
    requiringRole: vi.fn(() => endpoint),
    usingSecrets: vi.fn(() => endpoint),
    usingStrings: vi.fn(() => endpoint),
    handle: vi.fn(() => 'admin-fn'),
  };
  return { Functions: { endpoint }, Role: { Admin: 'admin' } };
});
vi.mock('@maple/firebase/square', () => {
  class PaymentError extends Error {}
  return {
    PaymentError,
    MT_SQUARE_SECRET_NAMES: ['MT_SQUARE_ACCESS_TOKEN'],
    MT_SQUARE_STRING_NAMES: ['MT_SQUARE_ENV', 'MT_SQUARE_LOCATION_ID', 'MT_SALES_TAX_RATE'],
    MT_SQUARE_KEYS: {},
    Square: class {},
  };
});
vi.mock('@maple/firebase/database', () => ({
  getDb: () => ({ collection: () => ({ add: mocks.mailAdd }) }),
  MusicTogetherScheduledChargeRepository: {
    findDue: mocks.findDue,
    tryClaimLease: mocks.tryClaimLease,
    update: mocks.chargeUpdate,
  },
  MusicTogetherRegistrationRepository: { findById: mocks.regFindById },
}));

import { runDueInstallmentCharges } from './charge-music-together-installments';

const fakeSquare = {
  locationId: 'MT_LOC',
  paymentsService: { createPayment: mocks.createPayment },
} as never;

const charge = {
  id: 'chg-1',
  registrationId: 'reg-1',
  sectionId: 'sec-1',
  installmentNumber: 2,
  amountCents: 13200,
  dueAt: new Date('2026-09-29T13:00:00Z'),
  status: 'scheduled',
  idempotencyKey: 'mt-charge-chg-1',
};

const chargeableReg = {
  id: 'reg-1',
  status: 'confirmed',
  email: 'jamie@example.com',
  squareCustomerId: 'cust-1',
  squareCardId: 'card-1',
};

const NOW = new Date('2026-09-30T13:00:00Z');

describe('runDueInstallmentCharges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tryClaimLease.mockResolvedValue(true);
    mocks.regFindById.mockResolvedValue(chargeableReg);
    mocks.createPayment.mockResolvedValue({ paymentId: 'pay-1' });
  });

  it('dry run reports what is due without claiming leases or charging', async () => {
    mocks.findDue.mockResolvedValue([charge]);
    const result = await runDueInstallmentCharges(NOW, fakeSquare, {
      dryRun: true,
    });
    expect(result.dryRun).toBe(true);
    expect(result.due).toBe(1);
    expect(result.charged).toBe(0);
    expect(result.wouldCharge?.[0]).toMatchObject({
      chargeId: 'chg-1',
      amountCents: 13200,
    });
    expect(mocks.tryClaimLease).not.toHaveBeenCalled();
    expect(mocks.createPayment).not.toHaveBeenCalled();
  });

  it('charges the stored card with the stable idempotency key, marks paid', async () => {
    mocks.findDue.mockResolvedValue([charge]);
    const result = await runDueInstallmentCharges(NOW, fakeSquare);

    expect(mocks.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'card-1',
        customerId: 'cust-1',
        amountCents: 13200,
        idempotencyKey: 'mt-charge-chg-1', // stable, derived from doc id
      })
    );
    expect(mocks.chargeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chg-1', status: 'paid', squarePaymentId: 'pay-1' })
    );
    expect(result).toMatchObject({ due: 1, charged: 1, failed: 0, skipped: 0 });
  });

  it('skips a charge whose lease is already taken (no double-charge)', async () => {
    mocks.findDue.mockResolvedValue([charge]);
    mocks.tryClaimLease.mockResolvedValue(false);

    const result = await runDueInstallmentCharges(NOW, fakeSquare);

    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(result).toMatchObject({ charged: 0, skipped: 1 });
  });

  it('does not charge a cancelled registration — marks the charge failed', async () => {
    mocks.findDue.mockResolvedValue([charge]);
    mocks.regFindById.mockResolvedValue({ ...chargeableReg, status: 'cancelled' });

    const result = await runDueInstallmentCharges(NOW, fakeSquare);

    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(mocks.chargeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chg-1', status: 'failed' })
    );
    expect(result.failed).toBe(1);
  });

  it('fails a charge whose registration has no card on file', async () => {
    mocks.findDue.mockResolvedValue([charge]);
    mocks.regFindById.mockResolvedValue({ ...chargeableReg, squareCardId: undefined });
    const result = await runDueInstallmentCharges(NOW, fakeSquare);
    expect(mocks.createPayment).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it('on payment failure: marks failed, emails the parent (loud, no retry)', async () => {
    mocks.findDue.mockResolvedValue([charge]);
    mocks.createPayment.mockRejectedValue(new Error('card declined'));

    const result = await runDueInstallmentCharges(NOW, fakeSquare);

    expect(mocks.chargeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'chg-1', status: 'failed', lastError: 'card declined' })
    );
    expect(mocks.mailAdd).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'jamie@example.com' })
    );
    expect(result).toMatchObject({ charged: 0, failed: 1 });
  });

  it('processes a mix and tallies results', async () => {
    const charge2 = { ...charge, id: 'chg-2', registrationId: 'reg-2', idempotencyKey: 'mt-charge-chg-2' };
    mocks.findDue.mockResolvedValue([charge, charge2]);
    // first claims, second loses the lease
    mocks.tryClaimLease.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const result = await runDueInstallmentCharges(NOW, fakeSquare);

    expect(result).toMatchObject({ due: 2, charged: 1, skipped: 1 });
  });
});
