import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  artistFindById: vi.fn(),
  saleFindUnpaidByArtist: vi.fn(),
  saleUpdatePayoutId: vi.fn(),
  payoutCreate: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
  throwInvalidArgument: (msg: string) => {
    throw new Error(msg);
  },
}));

vi.mock('@maple/firebase/database', () => ({
  ArtistRepository: { findById: mocks.artistFindById },
  SaleRepository: {
    findUnpaidByArtist: mocks.saleFindUnpaidByArtist,
    updatePayoutId: mocks.saleUpdatePayoutId,
  },
  PayoutRepository: { create: mocks.payoutCreate },
}));

import { generatePayout } from './generate-payout';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = generatePayout as unknown as Handler;

const mockArtist = { id: 'artist-1', name: 'Test Artist' };

const mockSales = [
  {
    id: 'sale-1',
    artistId: 'artist-1',
    salePrice: 50,
    commission: 20,
    artistEarnings: 30,
    soldAt: new Date('2025-01-15'),
  },
  {
    id: 'sale-2',
    artistId: 'artist-1',
    salePrice: 100,
    commission: 40,
    artistEarnings: 60,
    soldAt: new Date('2025-01-20'),
  },
];

const mockPayout = {
  id: 'payout-1',
  artistId: 'artist-1',
  periodStart: new Date('2025-01-01'),
  periodEnd: new Date('2025-01-31'),
  saleCount: 2,
  totalSales: 150,
  totalCommission: 60,
  amountOwed: 90,
  status: 'pending' as const,
  saleIds: ['sale-1', 'sale-2'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('generatePayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates a payout from unpaid sales', async () => {
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleFindUnpaidByArtist.mockResolvedValue(mockSales);
    mocks.payoutCreate.mockResolvedValue(mockPayout);
    mocks.saleUpdatePayoutId.mockResolvedValue(undefined);

    const result = (await handler({
      artistId: 'artist-1',
      periodStart: '2025-01-01T00:00:00.000Z',
      periodEnd: '2025-01-31T23:59:59.999Z',
    })) as { payout: { id: string } };

    expect(result.payout.id).toBe('payout-1');
    expect(mocks.payoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: 'artist-1',
        saleCount: 2,
        totalSales: 150,
        totalCommission: 60,
        amountOwed: 90,
        status: 'pending',
        saleIds: ['sale-1', 'sale-2'],
      })
    );
    expect(mocks.saleUpdatePayoutId).toHaveBeenCalledTimes(2);
    expect(mocks.saleUpdatePayoutId).toHaveBeenCalledWith(
      'sale-1',
      'payout-1'
    );
    expect(mocks.saleUpdatePayoutId).toHaveBeenCalledWith(
      'sale-2',
      'payout-1'
    );
  });

  it('throws when artistId is missing', async () => {
    await expect(
      handler({
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
      })
    ).rejects.toThrow(/Artist ID is required/);
  });

  it('throws when dates are missing', async () => {
    await expect(handler({ artistId: 'artist-1' })).rejects.toThrow(
      /Period start and end are required/
    );
  });

  it('throws when periodEnd is before periodStart', async () => {
    await expect(
      handler({
        artistId: 'artist-1',
        periodStart: '2025-02-01',
        periodEnd: '2025-01-01',
      })
    ).rejects.toThrow(/Period end must be after period start/);
  });

  it('throws when periodEnd is in the future', async () => {
    await expect(
      handler({
        artistId: 'artist-1',
        periodStart: '2025-01-01',
        periodEnd: '2026-01-01',
      })
    ).rejects.toThrow(/Period end cannot be in the future/);
  });

  it('throws when artist is not found', async () => {
    mocks.artistFindById.mockResolvedValue(undefined);

    await expect(
      handler({
        artistId: 'missing',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
      })
    ).rejects.toThrow(/Artist not found/);
  });

  it('throws when no unpaid sales exist', async () => {
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleFindUnpaidByArtist.mockResolvedValue([]);

    await expect(
      handler({
        artistId: 'artist-1',
        periodStart: '2025-01-01',
        periodEnd: '2025-01-31',
      })
    ).rejects.toThrow(/No unpaid sales found/);
  });
});
