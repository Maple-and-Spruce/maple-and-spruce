import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the syncInventoryToEtsy cloud function.
 */

const mocks = vi.hoisted(() => ({
  productFindById: vi.fn(),
  updateEtsyCache: vi.fn(),
  setQuantity: vi.fn(),
  getInventory: vi.fn(),
  updateInventory: vi.fn(),
  stripServerFields: vi.fn(),
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
    updateEtsyCache: mocks.updateEtsyCache,
  },
  FirestoreTokenStorage: {},
}));

vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    inventory = {
      setQuantity: mocks.setQuantity,
      getInventory: mocks.getInventory,
      updateInventory: mocks.updateInventory,
      stripServerFields: mocks.stripServerFields,
    };
  },
}));

import './sync-inventory-to-etsy';

const secrets = { ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret' };
const strings = { ETSY_REDIRECT_URI: 'https://example.com/callback' };

const mockSingleVariantProduct = {
  id: 'product-1',
  etsyListingId: '12345',
  etsyCache: {
    title: 'Test',
    description: 'Test',
    syncedAt: new Date(),
  },
  variants: [
    { id: 'var-1', label: 'Regular', sku: 'SKU-001', priceCents: 2500, quantity: 8 },
  ],
};

const mockMultiVariantProduct = {
  id: 'product-2',
  etsyListingId: '67890',
  etsyCache: {
    title: 'Test Multi',
    description: 'Test',
    syncedAt: new Date(),
  },
  variants: [
    { id: 'var-a', label: 'Small', sku: 'SKU-S', priceCents: 2000, quantity: 5 },
    { id: 'var-b', label: 'Large', sku: 'SKU-L', priceCents: 3000, quantity: 3 },
  ],
};

describe('syncInventoryToEtsy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs single-variant product using setQuantity', async () => {
    mocks.productFindById.mockResolvedValue(mockSingleVariantProduct);
    mocks.setQuantity.mockResolvedValue({});
    mocks.updateEtsyCache.mockResolvedValue(undefined);

    const result = (await captured.handler(
      { productId: 'product-1' },
      {},
      secrets,
      strings
    )) as { success: boolean; etsyListingId: string };

    expect(result.success).toBe(true);
    expect(result.etsyListingId).toBe('12345');
    expect(mocks.setQuantity).toHaveBeenCalledWith(12345, 8);
    expect(mocks.updateEtsyCache).toHaveBeenCalled();
  });

  it('syncs multi-variant product using updateInventory', async () => {
    mocks.productFindById.mockResolvedValue(mockMultiVariantProduct);
    mocks.getInventory.mockResolvedValue({
      products: [
        {
          product_id: 100,
          sku: 'SKU-S',
          offerings: [{ offering_id: 1, price: { amount: 2000, divisor: 100 }, quantity: 10, is_enabled: true }],
          property_values: [],
        },
        {
          product_id: 101,
          sku: 'SKU-L',
          offerings: [{ offering_id: 2, price: { amount: 3000, divisor: 100 }, quantity: 10, is_enabled: true }],
          property_values: [],
        },
      ],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    });
    mocks.stripServerFields.mockReturnValue({
      products: [
        {
          sku: 'SKU-S',
          offerings: [{ price: 20, quantity: 10, is_enabled: true }],
          property_values: [],
        },
        {
          sku: 'SKU-L',
          offerings: [{ price: 30, quantity: 10, is_enabled: true }],
          property_values: [],
        },
      ],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    });
    mocks.updateInventory.mockResolvedValue({});
    mocks.updateEtsyCache.mockResolvedValue(undefined);

    const result = (await captured.handler(
      { productId: 'product-2' },
      {},
      secrets,
      strings
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mocks.getInventory).toHaveBeenCalledWith(67890);
    expect(mocks.updateInventory).toHaveBeenCalledWith(
      67890,
      expect.objectContaining({
        products: expect.arrayContaining([
          expect.objectContaining({
            sku: 'SKU-S',
            offerings: [expect.objectContaining({ quantity: 5 })],
          }),
          expect.objectContaining({
            sku: 'SKU-L',
            offerings: [expect.objectContaining({ quantity: 3 })],
          }),
        ]),
      })
    );
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

  it('returns error when product has no Etsy listing', async () => {
    mocks.productFindById.mockResolvedValue({
      ...mockSingleVariantProduct,
      etsyListingId: undefined,
    });

    const result = (await captured.handler(
      { productId: 'product-1' },
      {},
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('not linked');
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
