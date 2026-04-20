import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  payoutFindById: vi.fn(),
  payoutMarkAsPaid: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
  throwNotFound: (entity: string, id: string) => {
    throw new Error(`${entity} not found: ${id}`);
  },
  throwFailedPrecondition: (msg: string) => {
    throw new Error(msg);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  PayoutRepository: {
    findById: mocks.payoutFindById,
    markAsPaid: mocks.payoutMarkAsPaid,
  },
}));

import { markPayoutPaid } from './mark-payout-paid';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = markPayoutPaid as unknown as Handler;

const mockPendingPayout = {
  id: 'payout-1',
  artistId: 'artist-1',
  status: 'pending' as const,
  saleCount: 2,
  totalSales: 150,
  totalCommission: 60,
  amountOwed: 90,
};

const mockPaidPayout = {
  ...mockPendingPayout,
  status: 'paid' as const,
  paidAt: new Date(),
  paymentMethod: 'check',
  paymentReference: 'CHK-001',
};

describe('markPayoutPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks a pending payout as paid', async () => {
    mocks.payoutFindById.mockResolvedValue(mockPendingPayout);
    mocks.payoutMarkAsPaid.mockResolvedValue(mockPaidPayout);

    const result = (await handler({
      payoutId: 'payout-1',
      paymentMethod: 'check',
      paymentReference: 'CHK-001',
    })) as { payout: { status: string } };

    expect(result.payout.status).toBe('paid');
    expect(mocks.payoutMarkAsPaid).toHaveBeenCalledWith(
      'payout-1',
      'check',
      'CHK-001'
    );
  });

  it('throws when payoutId is missing', async () => {
    await expect(
      handler({ paymentMethod: 'check' })
    ).rejects.toThrow(/Payout ID is required/);
  });

  it('throws when paymentMethod is missing', async () => {
    await expect(
      handler({ payoutId: 'payout-1' })
    ).rejects.toThrow(/Payment method is required/);
  });

  it('throws when payout is not found', async () => {
    mocks.payoutFindById.mockResolvedValue(undefined);

    await expect(
      handler({ payoutId: 'missing', paymentMethod: 'check' })
    ).rejects.toThrow(/Payout not found/);
  });

  it('throws when payout is already paid', async () => {
    mocks.payoutFindById.mockResolvedValue(mockPaidPayout);

    await expect(
      handler({ payoutId: 'payout-1', paymentMethod: 'venmo' })
    ).rejects.toThrow(/already marked as/);
  });
});
