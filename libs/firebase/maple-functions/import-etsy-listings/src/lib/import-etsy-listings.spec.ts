import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for importEtsyListings Cloud Function
 *
 * Focus: per-row import semantics — short-circuits for already-imported
 * and multi-variant listings, happy-path wiring into Square + Firestore,
 * and that image-download failures don't block the import.
 */

const mocks = vi.hoisted(() => {
  class EtsyHttpErrorStub extends Error {
    constructor(
      public readonly status: number,
      public readonly statusText: string,
      public readonly body: string
    ) {
      super(`Etsy API error ${status}: ${statusText} — ${body}`);
      this.name = 'EtsyHttpError';
    }
  }
  return {
    EtsyHttpErrorStub,
    // Etsy
    getListing: vi.fn(),
    // Firestore
    findByEtsyListingId: vi.fn(),
    findById: vi.fn(),
    createProduct: vi.fn(),
    updateEtsyCache: vi.fn(),
    createImport: vi.fn(),
    // Square
    createItem: vi.fn(),
    setQuantity: vi.fn(),
    uploadImage: vi.fn(),
    // network
    mockFetch: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: { getTokens: vi.fn() },
  ProductRepository: {
    findByEtsyListingId: mocks.findByEtsyListingId,
    findById: mocks.findById,
    create: mocks.createProduct,
    updateEtsyCache: mocks.updateEtsyCache,
  },
  EtsyImportRepository: {
    create: mocks.createImport,
  },
}));

vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    listings = { getListing: mocks.getListing };
  },
  EtsyHttpError: mocks.EtsyHttpErrorStub,
}));

vi.mock('@maple/firebase/square', () => ({
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_ENV', 'SQUARE_LOCATION_ID', 'SALES_TAX_RATE'],
  Square: class {
    locationId = 'location-abc';
    catalogService = {
      createItem: mocks.createItem,
      uploadImage: mocks.uploadImage,
    };
    inventoryService = { setQuantity: mocks.setQuantity };
  },
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      usingSecrets: vi.fn().mockReturnThis(),
      usingStrings: vi.fn().mockReturnThis(),
      requiringRole: vi.fn().mockReturnThis(),
      handle: vi.fn((handler: (...args: unknown[]) => Promise<unknown>) => {
        mocks.capturedHandler = handler;
        return 'mock-function';
      }),
    },
  },
  Role: { Admin: 'admin' },
}));

import './import-etsy-listings';

const secrets = {
  SQUARE_ACCESS_TOKEN: 'sqt',
  ETSY_API_KEY: 'ek',
  ETSY_SHARED_SECRET: 'es',
};
const strings = {
  SQUARE_ENV: 'LOCAL',
  SQUARE_LOCATION_ID: 'location-abc',
  SALES_TAX_RATE: '6.0',
  ETSY_REDIRECT_URI: 'https://example.com/callback',
};

function makeSimpleListing(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: 1001,
    title: 'Handmade Mug',
    description: 'A mug',
    state: 'active',
    price: { amount: 2500, divisor: 100, currency_code: 'USD' },
    quantity: 5,
    taxonomy_id: 42,
    tags: ['pottery'],
    url: 'https://etsy.com/listing/1001',
    images: [
      {
        rank: 1,
        url_fullxfull: 'https://etsy.com/img/1001-full.jpg',
        url_570xN: 'https://etsy.com/img/1001-570.jpg',
      },
    ],
    inventory: {
      products: [
        {
          sku: 'etsy-sku-1',
          offerings: [],
          property_values: [],
        },
      ],
    },
    ...overrides,
  };
}

function happyPathMocks() {
  mocks.findByEtsyListingId.mockResolvedValue(undefined);
  mocks.getListing.mockResolvedValue(makeSimpleListing());
  mocks.createItem.mockResolvedValue({
    squareItemId: 'sqi-1',
    squareVariationId: 'sqv-1',
    squareCatalogVersion: 1,
    sku: 'etsy-sku-1',
  });
  mocks.setQuantity.mockResolvedValue(undefined);
  mocks.mockFetch.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
    headers: { get: () => 'image/jpeg' },
  });
  mocks.uploadImage.mockResolvedValue({
    squareImageId: 'img-1',
    imageUrl: 'https://square.com/img/1',
    squareCatalogVersion: 2,
  });
  mocks.createProduct.mockResolvedValue({
    id: 'prod-1',
    squareItemId: 'sqi-1',
  });
  mocks.updateEtsyCache.mockResolvedValue(undefined);
  mocks.createImport.mockResolvedValue({ id: 'prod-1' });
  mocks.findById.mockResolvedValue({
    id: 'prod-1',
    etsyListingId: '1001',
    squareCache: {},
    etsyCache: {},
  });
}

describe('importEtsyListings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.mockFetch);
    vi.stubGlobal('Blob', class {});
  });

  it('short-circuits when a listing is already imported', async () => {
    mocks.findByEtsyListingId.mockResolvedValue({
      id: 'existing-product',
      etsyListingId: '1001',
    });

    const result = (await mocks.capturedHandler!(
      {
        listings: [{ listingId: '1001' }],
        artistId: 'artist-1',
        status: 'active',
      },
      { uid: 'admin-1' },
      secrets,
      strings
    )) as { results: Array<{ errorCode: string; success: boolean }> };

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].errorCode).toBe('ALREADY_IMPORTED');
    expect(mocks.getListing).not.toHaveBeenCalled();
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it('flags multi-variant listings and skips Square calls', async () => {
    mocks.findByEtsyListingId.mockResolvedValue(undefined);
    mocks.getListing.mockResolvedValue(
      makeSimpleListing({
        inventory: {
          products: [
            { sku: 'v1', offerings: [], property_values: [] },
            { sku: 'v2', offerings: [], property_values: [] },
          ],
        },
      })
    );

    const result = (await mocks.capturedHandler!(
      {
        listings: [{ listingId: '1001' }],
        artistId: 'artist-1',
        status: 'active',
      },
      { uid: 'admin-1' },
      secrets,
      strings
    )) as { results: Array<{ errorCode: string; success: boolean }> };

    expect(result.results[0].success).toBe(false);
    expect(result.results[0].errorCode).toBe('MULTI_VARIANT_NOT_SUPPORTED');
    expect(mocks.createItem).not.toHaveBeenCalled();
  });

  it('maps Etsy 404 to LISTING_NOT_FOUND', async () => {
    mocks.findByEtsyListingId.mockResolvedValue(undefined);
    mocks.getListing.mockRejectedValue(
      new mocks.EtsyHttpErrorStub(404, 'Not Found', '{}')
    );

    const result = (await mocks.capturedHandler!(
      {
        listings: [{ listingId: '9999' }],
        artistId: 'artist-1',
        status: 'active',
      },
      { uid: 'admin-1' },
      secrets,
      strings
    )) as { results: Array<{ errorCode: string; success: boolean }> };

    expect(result.results[0].errorCode).toBe('LISTING_NOT_FOUND');
    expect(result.results[0].success).toBe(false);
  });

  it('happy path creates Square item, Product, cache, and snapshot', async () => {
    happyPathMocks();

    const result = (await mocks.capturedHandler!(
      {
        listings: [{ listingId: '1001' }],
        artistId: 'artist-1',
        categoryId: 'cat-1',
        status: 'active',
      },
      { uid: 'admin-1' },
      secrets,
      strings
    )) as {
      results: Array<{ success: boolean; productId: string }>;
      successCount: number;
    };

    expect(result.successCount).toBe(1);
    expect(result.results[0].success).toBe(true);
    expect(result.results[0].productId).toBe('prod-1');

    expect(mocks.createItem).toHaveBeenCalledWith({
      name: 'Handmade Mug',
      description: 'A mug',
      priceCents: 2500,
      sku: 'etsy-sku-1',
    });
    expect(mocks.setQuantity).toHaveBeenCalledWith({
      squareVariationId: 'sqv-1',
      locationId: 'location-abc',
      quantity: 5,
    });
    expect(mocks.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        artistId: 'artist-1',
        categoryId: 'cat-1',
        status: 'active',
        priceCents: 2500,
        quantity: 5,
      }),
      expect.objectContaining({
        squareItemId: 'sqi-1',
        squareVariationId: 'sqv-1',
      })
    );
    expect(mocks.updateEtsyCache).toHaveBeenCalledWith(
      'prod-1',
      '1001',
      expect.objectContaining({
        title: 'Handmade Mug',
        priceCents: 2500,
        taxonomyId: 42,
        state: 'active',
      })
    );
    expect(mocks.createImport).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'prod-1',
        listingId: '1001',
        variantCount: 1,
        importedBy: 'admin-1',
      })
    );
  });

  it('swallows image-download failures and still imports', async () => {
    happyPathMocks();
    mocks.mockFetch.mockRejectedValue(new Error('Network error'));

    const result = (await mocks.capturedHandler!(
      {
        listings: [{ listingId: '1001' }],
        artistId: 'artist-1',
        status: 'active',
      },
      { uid: 'admin-1' },
      secrets,
      strings
    )) as { results: Array<{ success: boolean }> };

    expect(result.results[0].success).toBe(true);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.createProduct).toHaveBeenCalled();
  });

  it('processes multiple listings and counts per-row outcomes', async () => {
    // Listing A succeeds; listing B is already imported; listing C is multi-variant
    mocks.findByEtsyListingId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ id: 'p-existing', etsyListingId: '1002' })
      .mockResolvedValueOnce(undefined);
    mocks.getListing
      .mockResolvedValueOnce(makeSimpleListing({ listing_id: 1001 }))
      .mockResolvedValueOnce(
        makeSimpleListing({
          listing_id: 1003,
          inventory: {
            products: [
              { sku: 'v1', offerings: [], property_values: [] },
              { sku: 'v2', offerings: [], property_values: [] },
            ],
          },
        })
      );
    mocks.createItem.mockResolvedValue({
      squareItemId: 'sqi',
      squareVariationId: 'sqv',
      squareCatalogVersion: 1,
      sku: 'sk',
    });
    mocks.setQuantity.mockResolvedValue(undefined);
    mocks.mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
      headers: { get: () => 'image/jpeg' },
    });
    mocks.uploadImage.mockResolvedValue({
      squareImageId: 'i',
      imageUrl: '',
      squareCatalogVersion: 2,
    });
    mocks.createProduct.mockResolvedValue({ id: 'p-new' });
    mocks.updateEtsyCache.mockResolvedValue(undefined);
    mocks.createImport.mockResolvedValue({ id: 'p-new' });
    mocks.findById.mockResolvedValue({ id: 'p-new', etsyCache: {} });

    const result = (await mocks.capturedHandler!(
      {
        listings: [
          { listingId: '1001' },
          { listingId: '1002' },
          { listingId: '1003' },
        ],
        artistId: 'artist-1',
        status: 'active',
      },
      { uid: 'admin-1' },
      secrets,
      strings
    )) as {
      results: Array<{ success: boolean; errorCode?: string }>;
      successCount: number;
      failureCount: number;
    };

    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].errorCode).toBe('ALREADY_IMPORTED');
    expect(result.results[2].errorCode).toBe('MULTI_VARIANT_NOT_SUPPORTED');
  });

  it('returns empty results for empty input', async () => {
    const result = (await mocks.capturedHandler!(
      { listings: [], artistId: 'artist-1', status: 'active' },
      { uid: 'admin-1' },
      secrets,
      strings
    )) as { results: unknown[]; successCount: number; failureCount: number };

    expect(result.results).toEqual([]);
    expect(result.successCount).toBe(0);
    expect(result.failureCount).toBe(0);
    expect(mocks.getListing).not.toHaveBeenCalled();
  });

  it('throws when artistId is missing', async () => {
    await expect(
      mocks.capturedHandler!(
        { listings: [{ listingId: '1001' }], status: 'active' },
        { uid: 'admin-1' },
        secrets,
        strings
      )
    ).rejects.toThrow('artistId is required');
  });
});
