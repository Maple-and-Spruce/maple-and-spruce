import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the recordSale cloud function handler.
 *
 * createAdminFunction is mocked to return the handler directly so we can
 * invoke it like a plain function. Repositories are mocked; domain
 * calculation functions are real.
 */

const mocks = vi.hoisted(() => ({
  productFindById: vi.fn(),
  artistFindById: vi.fn(),
  saleCreate: vi.fn(),
  inventoryMovementCreate: vi.fn(),
  updateVariantQuantity: vi.fn(),
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
}));

vi.mock('@maple/firebase/database', () => ({
  ProductRepository: {
    findById: mocks.productFindById,
    updateVariantQuantity: mocks.updateVariantQuantity,
  },
  ArtistRepository: { findById: mocks.artistFindById },
  SaleRepository: { create: mocks.saleCreate },
  InventoryMovementRepository: { create: mocks.inventoryMovementCreate },
}));

import { recordSale } from './record-sale';

type Handler = (data: unknown, ctx?: unknown) => Promise<unknown>;
const handler = recordSale as unknown as Handler;

const mockProduct = {
  id: 'product-1',
  artistId: 'artist-1',
  customCommissionRate: undefined,
  variants: [
    {
      id: 'var-1',
      label: 'Regular',
      sku: 'SKU-001',
      priceCents: 2500,
      quantity: 10,
    },
  ],
};

const mockMultiVariantProduct = {
  ...mockProduct,
  id: 'product-2',
  variants: [
    { id: 'var-a', label: 'Small', sku: 'SKU-S', priceCents: 2000, quantity: 5 },
    { id: 'var-b', label: 'Large', sku: 'SKU-L', priceCents: 3000, quantity: 3 },
  ],
};

const mockArtist = {
  id: 'artist-1',
  name: 'Test Artist',
  defaultCommissionRate: 0.4,
};

const mockSale = {
  id: 'sale-1',
  productId: 'product-1',
  variantId: 'var-1',
  artistId: 'artist-1',
  salePrice: 25,
  quantitySold: 1,
  commission: 10,
  artistEarnings: 15,
  commissionRateApplied: 0.4,
  source: 'manual' as const,
  soldAt: new Date(),
  createdAt: new Date(),
};

describe('recordSale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a sale for a single-variant product', async () => {
    mocks.productFindById.mockResolvedValue(mockProduct);
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleCreate.mockResolvedValue(mockSale);
    mocks.inventoryMovementCreate.mockResolvedValue({ id: 'mov-1' });
    mocks.updateVariantQuantity.mockResolvedValue(undefined);

    const result = (await handler({ productId: 'product-1' })) as {
      sale: { id: string };
    };

    expect(result.sale.id).toBe('sale-1');
    expect(mocks.productFindById).toHaveBeenCalledWith('product-1');
    expect(mocks.artistFindById).toHaveBeenCalledWith('artist-1');
    expect(mocks.saleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        variantId: 'var-1',
        artistId: 'artist-1',
        source: 'manual',
      })
    );
    expect(mocks.inventoryMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        variantId: 'var-1',
        type: 'sale',
        quantityChange: -1,
        quantityBefore: 10,
        quantityAfter: 9,
      })
    );
    expect(mocks.updateVariantQuantity).toHaveBeenCalledWith(
      'product-1',
      'var-1',
      9
    );
  });

  it('uses custom sale price when provided', async () => {
    mocks.productFindById.mockResolvedValue(mockProduct);
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleCreate.mockResolvedValue(mockSale);
    mocks.inventoryMovementCreate.mockResolvedValue({ id: 'mov-1' });
    mocks.updateVariantQuantity.mockResolvedValue(undefined);

    await handler({ productId: 'product-1', salePriceCents: 2000 });

    // salePrice = 2000 / 100 = $20
    expect(mocks.saleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        salePrice: 20,
      })
    );
  });

  it('handles multiple quantity sold', async () => {
    mocks.productFindById.mockResolvedValue(mockProduct);
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleCreate.mockResolvedValue(mockSale);
    mocks.inventoryMovementCreate.mockResolvedValue({ id: 'mov-1' });
    mocks.updateVariantQuantity.mockResolvedValue(undefined);

    await handler({ productId: 'product-1', quantitySold: 3 });

    // salePrice = 2500 * 3 / 100 = $75
    expect(mocks.saleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        salePrice: 75,
        quantitySold: 3,
      })
    );
    expect(mocks.inventoryMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        quantityChange: -3,
        quantityBefore: 10,
        quantityAfter: 7,
      })
    );
    expect(mocks.updateVariantQuantity).toHaveBeenCalledWith(
      'product-1',
      'var-1',
      7
    );
  });

  it('requires variantId for multi-variant products', async () => {
    mocks.productFindById.mockResolvedValue(mockMultiVariantProduct);

    await expect(
      handler({ productId: 'product-2' })
    ).rejects.toThrow(/variantId is required/);

    expect(mocks.saleCreate).not.toHaveBeenCalled();
  });

  it('records sale for specified variant of multi-variant product', async () => {
    mocks.productFindById.mockResolvedValue(mockMultiVariantProduct);
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleCreate.mockResolvedValue(mockSale);
    mocks.inventoryMovementCreate.mockResolvedValue({ id: 'mov-1' });
    mocks.updateVariantQuantity.mockResolvedValue(undefined);

    await handler({ productId: 'product-2', variantId: 'var-b' });

    // var-b has priceCents: 3000
    expect(mocks.saleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: 'var-b',
        salePrice: 30,
      })
    );
  });

  it('throws when product is not found', async () => {
    mocks.productFindById.mockResolvedValue(undefined);

    await expect(
      handler({ productId: 'missing' })
    ).rejects.toThrow(/Product not found/);

    expect(mocks.saleCreate).not.toHaveBeenCalled();
  });

  it('throws when artist is not found', async () => {
    mocks.productFindById.mockResolvedValue(mockProduct);
    mocks.artistFindById.mockResolvedValue(undefined);

    await expect(
      handler({ productId: 'product-1' })
    ).rejects.toThrow(/Artist not found/);

    expect(mocks.saleCreate).not.toHaveBeenCalled();
  });

  it('throws when productId is missing', async () => {
    await expect(handler({})).rejects.toThrow(/Product ID is required/);
  });

  it('throws when quantity would go below zero', async () => {
    const lowStockProduct = {
      ...mockProduct,
      variants: [{ ...mockProduct.variants[0], quantity: 1 }],
    };
    mocks.productFindById.mockResolvedValue(lowStockProduct);
    mocks.artistFindById.mockResolvedValue(mockArtist);

    await expect(
      handler({ productId: 'product-1', quantitySold: 5 })
    ).rejects.toThrow(/Cannot reduce quantity below 0/);

    expect(mocks.saleCreate).not.toHaveBeenCalled();
  });

  it('uses product customCommissionRate when set', async () => {
    const productWithCustomRate = {
      ...mockProduct,
      customCommissionRate: 0.3,
    };
    mocks.productFindById.mockResolvedValue(productWithCustomRate);
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleCreate.mockResolvedValue(mockSale);
    mocks.inventoryMovementCreate.mockResolvedValue({ id: 'mov-1' });
    mocks.updateVariantQuantity.mockResolvedValue(undefined);

    await handler({ productId: 'product-1' });

    expect(mocks.saleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        commissionRateApplied: 0.3,
      })
    );
  });
});
