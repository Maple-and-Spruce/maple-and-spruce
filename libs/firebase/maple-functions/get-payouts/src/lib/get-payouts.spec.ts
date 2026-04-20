import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  payoutFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
}));

vi.mock('@maple/firebase/database', () => ({
  PayoutRepository: {
    findAll: mocks.payoutFindAll,
  },
}));

import { getPayouts } from './get-payouts';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = getPayouts as unknown as Handler;

const mockPayouts = [
  {
    id: 'payout-1',
    artistId: 'artist-1',
    status: 'pending',
    saleCount: 3,
    totalSales: 200,
    amountOwed: 120,
  },
  {
    id: 'payout-2',
    artistId: 'artist-2',
    status: 'paid',
    saleCount: 1,
    totalSales: 50,
    amountOwed: 30,
  },
];

describe('getPayouts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all payouts when no filters', async () => {
    mocks.payoutFindAll.mockResolvedValue(mockPayouts);

    const result = (await handler({})) as {
      payouts: { id: string }[];
    };

    expect(result.payouts).toHaveLength(2);
    expect(mocks.payoutFindAll).toHaveBeenCalledWith({
      artistId: undefined,
      status: undefined,
    });
  });

  it('passes filters to repository', async () => {
    mocks.payoutFindAll.mockResolvedValue([mockPayouts[0]]);

    const result = (await handler({
      artistId: 'artist-1',
      status: 'pending',
    })) as { payouts: { id: string }[] };

    expect(result.payouts).toHaveLength(1);
    expect(mocks.payoutFindAll).toHaveBeenCalledWith({
      artistId: 'artist-1',
      status: 'pending',
    });
  });
});
