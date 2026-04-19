import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the getSales cloud function handler.
 */

const mocks = vi.hoisted(() => ({
  saleFindAll: vi.fn(),
}));

vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: <TReq, TRes>(
    handler: (data: TReq, ctx: unknown) => Promise<TRes>
  ) => handler,
}));

vi.mock('@maple/firebase/database', () => ({
  SaleRepository: { findAll: mocks.saleFindAll },
}));

import { getSales } from './get-sales';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = getSales as unknown as Handler;

const mockSales = [
  {
    id: 'sale-1',
    productId: 'product-1',
    artistId: 'artist-1',
    salePrice: 25,
    quantitySold: 1,
    source: 'manual',
    soldAt: new Date('2026-04-01'),
    createdAt: new Date(),
  },
  {
    id: 'sale-2',
    productId: 'product-2',
    artistId: 'artist-1',
    salePrice: 30,
    quantitySold: 1,
    source: 'etsy',
    soldAt: new Date('2026-04-05'),
    createdAt: new Date(),
  },
];

describe('getSales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all sales with no filters', async () => {
    mocks.saleFindAll.mockResolvedValue(mockSales);

    const result = (await handler({})) as { sales: unknown[] };

    expect(result.sales).toHaveLength(2);
    expect(mocks.saleFindAll).toHaveBeenCalledWith({
      artistId: undefined,
      source: undefined,
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('passes artistId filter', async () => {
    mocks.saleFindAll.mockResolvedValue([mockSales[0]]);

    await handler({ artistId: 'artist-1' });

    expect(mocks.saleFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ artistId: 'artist-1' })
    );
  });

  it('passes source filter', async () => {
    mocks.saleFindAll.mockResolvedValue([mockSales[1]]);

    await handler({ source: 'etsy' });

    expect(mocks.saleFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'etsy' })
    );
  });

  it('converts date strings to Date objects', async () => {
    mocks.saleFindAll.mockResolvedValue([]);

    await handler({ from: '2026-04-01', to: '2026-04-30' });

    const call = mocks.saleFindAll.mock.calls[0][0];
    expect(call.dateFrom).toBeInstanceOf(Date);
    expect(call.dateTo).toBeInstanceOf(Date);
  });

  it('returns empty array when no sales found', async () => {
    mocks.saleFindAll.mockResolvedValue([]);

    const result = (await handler({})) as { sales: unknown[] };

    expect(result.sales).toHaveLength(0);
  });
});
