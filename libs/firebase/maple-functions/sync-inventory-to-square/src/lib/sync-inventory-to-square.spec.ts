import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the syncInventoryToSquare cloud function.
 */

const mocks = vi.hoisted(() => ({
  productFindById: vi.fn(),
  updateSquareCache: vi.fn(),
  setQuantities: vi.fn(),
}));

const captured = vi.hoisted(() => ({
  handler: undefined as unknown as (
    data: unknown,
    context: unknown,
    secrets: Record<string, string>,
    strings: Record<string, string>
  ) => Promise<unknown>,
}));

const mockFunctionsEndpoint = vi.hoisted(() => {
  function handle<TReq, TRes>(
    handler: (
      data: TReq,
      ctx: unknown,
      secrets: Record<string, string>,
      strings: Record<string, string>
    ) => Promise<TRes>
  ) {
    captured.handler = handler as typeof captured.handler;
    return handler;
  }

  return {
    usingSecrets: () => ({
      usingStrings: () => ({
        requiringRole: () => ({ handle }),
      }),
    }),
  };
});

vi.mock('@maple/firebase/functions', () => ({
  Functions: { endpoint: mockFunctionsEndpoint },
  Role: { Admin: 'admin' },
}));

vi.mock('@maple/firebase/database', () => ({
  ProductRepository: {
    findById: mocks.productFindById,
    updateSquareCache: mocks.updateSquareCache,
  },
}));

vi.mock('@maple/firebase/square', () => ({
  Square: class {
    inventoryService = { setQuantities: mocks.setQuantities };
    locationId = 'LOC-DEFAULT';
  },
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SALES_TAX_RATE'],
}));

import './sync-inventory-to-square';

const secrets = { SQUARE_ACCESS_TOKEN: 'token' };
const strings = {
  SQUARE_ENV: 'LOCAL',
  SQUARE_LOCATION_ID: 'LOC-1',
  SALES_TAX_RATE: '6.0',
};

const mockProduct = {
  id: 'product-1',
  squareItemId: 'SQ-ITEM-1',
  squareLocationId: 'LOC-1',
  variants: [
    {
      id: 'var-1',
      label: 'Regular',
      sku: 'SKU-001',
      priceCents: 2500,
      quantity: 8,
      squareVariationId: 'SQ-VAR-1',
    },
  ],
};

const mockMultiVariantProduct = {
  id: 'product-2',
  squareItemId: 'SQ-ITEM-2',
  squareLocationId: 'LOC-1',
  variants: [
    {
      id: 'var-a',
      label: 'Small',
      sku: 'SKU-S',
      priceCents: 2000,
      quantity: 5,
      squareVariationId: 'SQ-VAR-A',
    },
    {
      id: 'var-b',
      label: 'Large',
      sku: 'SKU-L',
      priceCents: 3000,
      quantity: 3,
      squareVariationId: 'SQ-VAR-B',
    },
    {
      id: 'var-c',
      label: 'Etsy Only',
      sku: 'SKU-E',
      priceCents: 3500,
      quantity: 2,
      // No squareVariationId - should be skipped
    },
  ],
};

describe('syncInventoryToSquare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs a single-variant product to Square', async () => {
    mocks.productFindById.mockResolvedValue(mockProduct);
    mocks.setQuantities.mockResolvedValue(undefined);
    mocks.updateSquareCache.mockResolvedValue(undefined);

    const result = (await captured.handler(
      { productId: 'product-1' },
      {},
      secrets,
      strings
    )) as { success: boolean; syncedVariants: number };

    expect(result.success).toBe(true);
    expect(result.syncedVariants).toBe(1);
    expect(mocks.setQuantities).toHaveBeenCalledWith([
      {
        squareVariationId: 'SQ-VAR-1',
        locationId: 'LOC-1',
        quantity: 8,
      },
    ]);
    expect(mocks.updateSquareCache).toHaveBeenCalled();
  });

  it('syncs multi-variant product, skipping variants without squareVariationId', async () => {
    mocks.productFindById.mockResolvedValue(mockMultiVariantProduct);
    mocks.setQuantities.mockResolvedValue(undefined);
    mocks.updateSquareCache.mockResolvedValue(undefined);

    const result = (await captured.handler(
      { productId: 'product-2' },
      {},
      secrets,
      strings
    )) as { success: boolean; syncedVariants: number };

    expect(result.success).toBe(true);
    expect(result.syncedVariants).toBe(2);
    expect(mocks.setQuantities).toHaveBeenCalledWith([
      { squareVariationId: 'SQ-VAR-A', locationId: 'LOC-1', quantity: 5 },
      { squareVariationId: 'SQ-VAR-B', locationId: 'LOC-1', quantity: 3 },
    ]);
  });

  it('returns error when product not found', async () => {
    mocks.productFindById.mockResolvedValue(undefined);

    const result = (await captured.handler(
      { productId: 'missing' },
      {},
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when no variants have squareVariationId', async () => {
    mocks.productFindById.mockResolvedValue({
      ...mockProduct,
      variants: [
        { id: 'var-1', label: 'Etsy Only', quantity: 5 },
      ],
    });

    const result = (await captured.handler(
      { productId: 'product-1' },
      {},
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('No variants with Square variation IDs');
  });

  it('returns error when productId is missing', async () => {
    const result = (await captured.handler(
      {},
      {},
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('productId is required');
  });
});
