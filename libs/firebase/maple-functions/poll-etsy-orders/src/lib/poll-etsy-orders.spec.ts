import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for the pollEtsyOrders cloud function.
 *
 * Mocks the Functions builder to extract the handler, then mocks
 * all repositories and the Etsy client to test the polling logic.
 */

const mocks = vi.hoisted(() => ({
  productFindByEtsyListingId: vi.fn(),
  artistFindById: vi.fn(),
  saleCreate: vi.fn(),
  saleFindByEtsyReceiptId: vi.fn(),
  inventoryMovementCreate: vi.fn(),
  updateVariantQuantity: vi.fn(),
  getTokens: vi.fn(),
  getShopReceipts: vi.fn(),
  dbDocGet: vi.fn(),
  dbDocSet: vi.fn(),
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
    findByEtsyListingId: mocks.productFindByEtsyListingId,
    updateVariantQuantity: mocks.updateVariantQuantity,
  },
  ArtistRepository: { findById: mocks.artistFindById },
  SaleRepository: {
    create: mocks.saleCreate,
    findByEtsyReceiptId: mocks.saleFindByEtsyReceiptId,
  },
  InventoryMovementRepository: { create: mocks.inventoryMovementCreate },
  FirestoreTokenStorage: {
    getTokens: mocks.getTokens,
  },
  db: {
    doc: () => ({
      get: mocks.dbDocGet,
      set: mocks.dbDocSet,
    }),
  },
}));

vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    receipts = { getShopReceipts: mocks.getShopReceipts };
  },
}));

// Import after mocks
import './poll-etsy-orders';

const secrets = { ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret' };
const strings = { ETSY_REDIRECT_URI: 'https://example.com/callback' };

const mockProduct = {
  id: 'product-1',
  artistId: 'artist-1',
  etsyListingId: '12345',
  customCommissionRate: undefined,
  variants: [
    {
      id: 'var-1',
      label: 'Regular',
      sku: 'SKU-001',
      priceCents: 2500,
      quantity: 10,
      etsyProductId: 99,
    },
  ],
};

const mockArtist = {
  id: 'artist-1',
  name: 'Test Artist',
  defaultCommissionRate: 0.4,
};

const mockReceipt = {
  receipt_id: 1001,
  receipt_type: 0,
  order_id: 2001,
  buyer_email: 'buyer@test.com',
  name: 'Test Buyer',
  status: 'paid',
  create_timestamp: 1700000000,
  update_timestamp: 1700000100,
  grandtotal: { amount: 2500, divisor: 100, currency_code: 'USD' },
  transactions: [
    {
      transaction_id: 3001,
      listing_id: 12345,
      product_id: 99,
      quantity: 1,
      price: { amount: 2500, divisor: 100, currency_code: 'USD' },
      title: 'Test Product',
      sku: 'SKU-001',
    },
  ],
};

describe('pollEtsyOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes a new paid receipt and creates sale + inventory movement', async () => {
    // No cursor exists yet
    mocks.dbDocGet.mockResolvedValue({ exists: false });
    mocks.dbDocSet.mockResolvedValue(undefined);
    mocks.getTokens.mockResolvedValue({ shopId: '12345' });
    mocks.getShopReceipts.mockResolvedValue([mockReceipt]);
    mocks.saleFindByEtsyReceiptId.mockResolvedValue(undefined);
    mocks.productFindByEtsyListingId.mockResolvedValue(mockProduct);
    mocks.artistFindById.mockResolvedValue(mockArtist);
    mocks.saleCreate.mockResolvedValue({ id: 'sale-1' });
    mocks.inventoryMovementCreate.mockResolvedValue({ id: 'mov-1' });
    mocks.updateVariantQuantity.mockResolvedValue(undefined);

    const result = (await captured.handler(
      {},
      {},
      secrets,
      strings
    )) as { processed: number; skipped: number; errors: string[] };

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    expect(mocks.saleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        variantId: 'var-1',
        artistId: 'artist-1',
        source: 'etsy',
        etsyReceiptId: '1001-3001',
        etsyOrderId: '2001',
      })
    );

    expect(mocks.inventoryMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        variantId: 'var-1',
        type: 'sale',
        quantityChange: -1,
        source: 'etsy',
      })
    );

    expect(mocks.updateVariantQuantity).toHaveBeenCalledWith(
      'product-1',
      'var-1',
      9
    );

    // Poll cursor should be updated
    expect(mocks.dbDocSet).toHaveBeenCalledWith(
      expect.objectContaining({ lastPollTimestamp: 1700000000 }),
      { merge: true }
    );
  });

  it('skips already-recorded transactions', async () => {
    mocks.dbDocGet.mockResolvedValue({ exists: false });
    mocks.dbDocSet.mockResolvedValue(undefined);
    mocks.getTokens.mockResolvedValue({ shopId: '12345' });
    mocks.getShopReceipts.mockResolvedValue([mockReceipt]);
    mocks.saleFindByEtsyReceiptId.mockResolvedValue({ id: 'existing-sale' });

    const result = (await captured.handler(
      {},
      {},
      secrets,
      strings
    )) as { processed: number; skipped: number; errors: string[] };

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mocks.saleCreate).not.toHaveBeenCalled();
  });

  it('skips receipts with non-paid status', async () => {
    mocks.dbDocGet.mockResolvedValue({ exists: false });
    mocks.dbDocSet.mockResolvedValue(undefined);
    mocks.getTokens.mockResolvedValue({ shopId: '12345' });

    const openReceipt = { ...mockReceipt, status: 'open' };
    mocks.getShopReceipts.mockResolvedValue([openReceipt]);

    const result = (await captured.handler(
      {},
      {},
      secrets,
      strings
    )) as { processed: number; skipped: number; errors: string[] };

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(mocks.saleFindByEtsyReceiptId).not.toHaveBeenCalled();
  });

  it('records errors for missing products without stopping', async () => {
    mocks.dbDocGet.mockResolvedValue({ exists: false });
    mocks.dbDocSet.mockResolvedValue(undefined);
    mocks.getTokens.mockResolvedValue({ shopId: '12345' });
    mocks.getShopReceipts.mockResolvedValue([mockReceipt]);
    mocks.saleFindByEtsyReceiptId.mockResolvedValue(undefined);
    mocks.productFindByEtsyListingId.mockResolvedValue(undefined);

    const result = (await captured.handler(
      {},
      {},
      secrets,
      strings
    )) as { processed: number; skipped: number; errors: string[] };

    expect(result.processed).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('No product found');
  });

  it('returns early when no shop ID is configured', async () => {
    mocks.getTokens.mockResolvedValue(null);

    const result = (await captured.handler(
      {},
      {},
      secrets,
      strings
    )) as { processed: number; skipped: number; errors: string[] };

    expect(result.errors).toContain('No Etsy shop ID configured');
  });

  it('uses existing poll cursor timestamp', async () => {
    mocks.dbDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastPollTimestamp: 1699999000 }),
    });
    mocks.dbDocSet.mockResolvedValue(undefined);
    mocks.getTokens.mockResolvedValue({ shopId: '12345' });
    mocks.getShopReceipts.mockResolvedValue([]);

    await captured.handler({}, {}, secrets, strings);

    expect(mocks.getShopReceipts).toHaveBeenCalledWith(
      12345,
      expect.objectContaining({ minCreated: 1699999000 })
    );
  });

  it('uses forceFullSync to ignore cursor', async () => {
    mocks.dbDocGet.mockResolvedValue({
      exists: true,
      data: () => ({ lastPollTimestamp: 1699999000 }),
    });
    mocks.dbDocSet.mockResolvedValue(undefined);
    mocks.getTokens.mockResolvedValue({ shopId: '12345' });
    mocks.getShopReceipts.mockResolvedValue([]);

    await captured.handler({ forceFullSync: true }, {}, secrets, strings);

    expect(mocks.getShopReceipts).toHaveBeenCalledWith(
      12345,
      expect.objectContaining({ minCreated: undefined })
    );
  });
});
