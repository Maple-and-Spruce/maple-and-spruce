import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the payouts router's artist-payout route handlers. The
 * transaction that stops a sale being paid twice is exercised against the
 * emulator in `apps/functions-integration-tests-payouts`; here, the wiring.
 */

const mocks = vi.hoisted(() => ({
  artistFindById: vi.fn(),
  saleFindUnpaidByArtist: vi.fn(),
  payoutFindAll: vi.fn(),
  payoutFindById: vi.fn(),
  payoutGenerate: vi.fn(),
  payoutMarkAsPaid: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => {
  const fail = (message: string): never => {
    throw new Error(message);
  };
  return {
    throwInvalidArgument: fail,
    throwFailedPrecondition: fail,
    throwNotFound: (entity: string, id: string) => fail(`${entity} not found: ${id}`),
  };
});

vi.mock('@maple/firebase/database', () => ({
  ArtistRepository: { findById: mocks.artistFindById },
  SaleRepository: { findUnpaidByArtist: mocks.saleFindUnpaidByArtist },
  PayoutRepository: {
    findAll: mocks.payoutFindAll,
    findById: mocks.payoutFindById,
    generate: mocks.payoutGenerate,
    markAsPaid: mocks.payoutMarkAsPaid,
  },
}));

import {
  generateArtistPayout,
  getArtistPayouts,
  markArtistPayoutPaid,
} from './artist-payouts';

type Handler = (data: unknown) => Promise<unknown>;
const generate = generateArtistPayout as unknown as Handler;
const markPaid = markArtistPayoutPaid as unknown as Handler;

const mockArtist = { id: 'artist-1', name: 'Test Artist' };

const mockSales = [
  { id: 'sale-1', artistId: 'artist-1', salePrice: 50, commission: 20, artistEarnings: 30 },
  { id: 'sale-2', artistId: 'artist-1', salePrice: 100.005, commission: 40, artistEarnings: 60.004 },
];

const mockPayout = {
  id: 'payout-1',
  artistId: 'artist-1',
  status: 'pending' as const,
  saleCount: 2,
  totalSales: 150.01,
  totalCommission: 60,
  amountOwed: 90,
  saleIds: ['sale-1', 'sale-2'],
};

describe('getArtistPayouts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes the filters to the repository', async () => {
    mocks.payoutFindAll.mockResolvedValue([mockPayout]);

    const result = await getArtistPayouts({ artistId: 'artist-1', status: 'pending' });

    expect(result.payouts).toEqual([mockPayout]);
    expect(mocks.payoutFindAll).toHaveBeenCalledWith({ artistId: 'artist-1', status: 'pending' });
  });

  it('returns every payout when unfiltered', async () => {
    mocks.payoutFindAll.mockResolvedValue([]);

    await getArtistPayouts({});

    expect(mocks.payoutFindAll).toHaveBeenCalledWith({ artistId: undefined, status: undefined });
  });
});

describe('generateArtistPayout', () => {
  const january = {
    artistId: 'artist-1',
    periodStart: '2025-01-01T00:00:00.000Z',
    periodEnd: '2025-01-31T23:59:59.999Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01'));
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleFindUnpaidByArtist.mockResolvedValue(mockSales);
  });

  afterEach(() => vi.useRealTimers());

  it('claims the unpaid sales in one payout, with totals rounded to the cent', async () => {
    mocks.payoutGenerate.mockResolvedValue({ kind: 'created', payout: mockPayout });

    const result = (await generate(january)) as { payout: { id: string } };

    expect(result.payout.id).toBe('payout-1');
    expect(mocks.saleFindUnpaidByArtist).toHaveBeenCalledWith(
      'artist-1',
      new Date(january.periodStart),
      new Date(january.periodEnd)
    );
    expect(mocks.payoutGenerate).toHaveBeenCalledWith({
      artistId: 'artist-1',
      periodStart: new Date(january.periodStart),
      periodEnd: new Date(january.periodEnd),
      saleCount: 2,
      totalSales: 150.01,
      totalCommission: 60,
      amountOwed: 90,
      status: 'pending',
      saleIds: ['sale-1', 'sale-2'],
    });
  });

  it('refuses when another payout claimed the sales first', async () => {
    mocks.payoutGenerate.mockResolvedValue({ kind: 'already-claimed', saleIds: ['sale-2'] });

    await expect(generate(january)).rejects.toThrow(/just put on another payout/);
  });

  it.each([
    [{ periodStart: '2025-01-01', periodEnd: '2025-01-31' }, /Artist ID is required/],
    [{ artistId: 'artist-1' }, /Period start and end are required/],
    [{ artistId: 'artist-1', periodStart: 'soon', periodEnd: '2025-01-31' }, /Invalid date format/],
    [{ artistId: 'artist-1', periodStart: '2025-02-01', periodEnd: '2025-01-01' }, /must be after/],
    [{ artistId: 'artist-1', periodStart: '2025-01-01', periodEnd: '2026-01-01' }, /in the future/],
  ])('rejects %j before reading anything', async (input, error) => {
    await expect(generate(input)).rejects.toThrow(error);
    expect(mocks.artistFindById).not.toHaveBeenCalled();
    expect(mocks.payoutGenerate).not.toHaveBeenCalled();
  });

  it('refuses an unknown artist', async () => {
    mocks.artistFindById.mockResolvedValue(undefined);

    await expect(generate({ ...january, artistId: 'missing' })).rejects.toThrow(/Artist not found/);
    expect(mocks.payoutGenerate).not.toHaveBeenCalled();
  });

  it('refuses when there is nothing unpaid', async () => {
    mocks.saleFindUnpaidByArtist.mockResolvedValue([]);

    await expect(generate(january)).rejects.toThrow(/No unpaid sales found/);
    expect(mocks.payoutGenerate).not.toHaveBeenCalled();
  });
});

describe('markArtistPayoutPaid', () => {
  const paid = { ...mockPayout, status: 'paid' as const, paymentMethod: 'check' };

  beforeEach(() => vi.clearAllMocks());

  it('marks a pending payout paid', async () => {
    mocks.payoutFindById.mockResolvedValue(mockPayout);
    mocks.payoutMarkAsPaid.mockResolvedValue(paid);

    const result = await markArtistPayoutPaid({
      payoutId: 'payout-1',
      paymentMethod: 'check',
      paymentReference: 'CHK-001',
    });

    expect(result.payout.status).toBe('paid');
    expect(mocks.payoutMarkAsPaid).toHaveBeenCalledWith('payout-1', 'check', 'CHK-001');
  });

  it.each([
    [{ paymentMethod: 'check' }, /Payout ID is required/],
    [{ payoutId: 'payout-1' }, /Payment method is required/],
  ])('rejects %j', async (input, error) => {
    await expect(markPaid(input)).rejects.toThrow(error);
  });

  it('refuses an unknown payout', async () => {
    mocks.payoutFindById.mockResolvedValue(undefined);

    await expect(markPaid({ payoutId: 'missing', paymentMethod: 'check' })).rejects.toThrow(
      /Payout not found/
    );
  });

  it('refuses a payout that is already paid', async () => {
    mocks.payoutFindById.mockResolvedValue(paid);

    await expect(markPaid({ payoutId: 'payout-1', paymentMethod: 'venmo' })).rejects.toThrow(
      /already marked as 'paid'/
    );
    expect(mocks.payoutMarkAsPaid).not.toHaveBeenCalled();
  });
});
