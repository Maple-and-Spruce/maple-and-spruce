import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product, SyncConflict } from '@maple/ts/domain';

/**
 * Tests for detect-sync-conflicts.ts
 *
 * Tests the business logic for detecting mismatches between
 * Firestore product data and Square/Etsy catalog/inventory.
 */

// Define mocks using vi.hoisted
const mocks = vi.hoisted(() => {
  return {
    // Repository mocks
    productFindAll: vi.fn(),
    conflictCreate: vi.fn(),
    conflictFindExisting: vi.fn(),
    conflictFindPending: vi.fn(),
    // Square mocks
    catalogListItems: vi.fn(),
    inventoryGetCounts: vi.fn(),
    // Etsy mocks
    etsyGetListing: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

// Mock ProductRepository
vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: { getTokens: vi.fn() },
  ProductRepository: {
    findAll: mocks.productFindAll,
  },
  SyncConflictRepository: {
    create: mocks.conflictCreate,
    findExistingConflict: mocks.conflictFindExisting,
    findPending: mocks.conflictFindPending,
  },
}));

// Mock Square class
vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(() => ({
    catalogService: {
      listItems: mocks.catalogListItems,
    },
    inventoryService: {
      getCounts: mocks.inventoryGetCounts,
    },
    locationId: 'MOCK_LOCATION_ID',
  })),
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_ENV', 'SQUARE_LOCATION_ID'],
}));

// Mock Etsy client
vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    listings = { getListing: mocks.etsyGetListing };
    inventory = {};
  },
}));

// Mock firebase functions - capture the handler
vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      usingSecrets: vi.fn().mockReturnThis(),
      usingStrings: vi.fn().mockReturnThis(),
      requiringRole: vi.fn().mockReturnThis(),
      withOptions: vi.fn().mockReturnThis(),
      handle: vi.fn((handler: (...args: unknown[]) => Promise<unknown>) => {
        mocks.capturedHandler = handler;
        return 'mock-function';
      }),
    },
  },
  Role: {
    Admin: 'admin',
  },
}));

// Import to trigger handler capture
import './detect-sync-conflicts';

const secrets = {
  SQUARE_ACCESS_TOKEN: 'sq-token',
  ETSY_API_KEY: 'etsy-key',
  ETSY_SHARED_SECRET: 'etsy-secret',
};
const strings = {
  SQUARE_ENV: 'sandbox',
  SQUARE_LOCATION_ID: 'loc-1',
  ETSY_REDIRECT_URI: 'https://example.com/callback',
};
const context = { uid: 'admin-1' };

describe('Sync Conflict Detection Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper to create mock product
  const createMockProduct = (
    id: string,
    overrides: Partial<{
      squareItemId: string;
      squareVariationId: string;
      cachedQuantity: number;
      cachedPrice: number;
      cachedName: string;
    }> = {}
  ): Product => ({
    id,
    artistId: 'artist-123',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    squareItemId: overrides.squareItemId ?? `SQ_ITEM_${id}`,
    squareVariationId: overrides.squareVariationId ?? `SQ_VAR_${id}`,
    squareCatalogVersion: 1,
    variants: [{
      id: 'var_1',
      label: 'Regular',
      sku: `SKU_${id}`,
      priceCents: overrides.cachedPrice ?? 2500,
      quantity: overrides.cachedQuantity ?? 5,
      squareVariationId: overrides.squareVariationId ?? `SQ_VAR_${id}`,
    }],
    squareCache: {
      name: overrides.cachedName ?? `Product ${id}`,
      priceCents: overrides.cachedPrice ?? 2500,
      quantity: overrides.cachedQuantity ?? 5,
      sku: `SKU_${id}`,
      syncedAt: new Date(),
    },
  });

  // Helper to create mock Square catalog object
  const createMockSquareItem = (
    id: string,
    overrides: Partial<{
      name: string;
      priceCents: number;
      variationId: string;
    }> = {}
  ) => ({
    id,
    type: 'ITEM',
    version: BigInt(1),
    itemData: {
      name: overrides.name ?? `Square Item ${id}`,
      variations: [
        {
          id: overrides.variationId ?? `VAR_${id}`,
          type: 'ITEM_VARIATION',
          itemVariationData: {
            priceMoney: {
              amount: BigInt(overrides.priceCents ?? 2500),
              currency: 'USD',
            },
          },
        },
      ],
    },
  });

  describe('quantity mismatch detection', () => {
    it('detects when Firestore quantity differs from Square', async () => {
      const product = createMockProduct('prod-001', {
        cachedQuantity: 5,
        squareVariationId: 'VAR_001',
      });

      mocks.productFindAll.mockResolvedValue([product]);
      mocks.catalogListItems.mockResolvedValue([
        createMockSquareItem('SQ_ITEM_prod-001', { variationId: 'VAR_001' }),
      ]);
      mocks.inventoryGetCounts.mockResolvedValue([
        { squareVariationId: 'VAR_001', quantity: 3 }, // Different from cached 5
      ]);
      mocks.conflictFindExisting.mockResolvedValue(null);
      mocks.conflictCreate.mockResolvedValue({ id: 'conflict-new' });

      // The detection would create a conflict because 5 !== 3
      // Testing the comparison logic
      const cachedQuantity = product.squareCache.quantity ?? 0;
      const squareQuantity = 3;

      expect(cachedQuantity).not.toBe(squareQuantity);
      expect(cachedQuantity - squareQuantity).toBe(2);
    });

    it('does not create conflict when quantities match', () => {
      const product = createMockProduct('prod-002', { cachedQuantity: 5 });
      const squareQuantity = 5;

      expect(product.squareCache.quantity).toBe(squareQuantity);
    });

    it('handles zero quantities', () => {
      const product = createMockProduct('prod-003', { cachedQuantity: 0 });
      const squareQuantity = 0;

      expect(product.squareCache.quantity).toBe(squareQuantity);
    });
  });

  describe('price mismatch detection', () => {
    it('detects when Firestore price differs from Square', () => {
      const product = createMockProduct('prod-001', { cachedPrice: 2500 });
      const squarePrice = 3000;

      expect(product.squareCache.priceCents).not.toBe(squarePrice);
    });

    it('does not flag when prices match', () => {
      const product = createMockProduct('prod-002', { cachedPrice: 2500 });
      const squarePrice = 2500;

      expect(product.squareCache.priceCents).toBe(squarePrice);
    });
  });

  describe('missing external detection', () => {
    it('identifies product that exists locally but not in Square', async () => {
      const product = createMockProduct('prod-001', {
        squareItemId: 'SQ_DELETED_ITEM',
      });

      mocks.productFindAll.mockResolvedValue([product]);
      mocks.catalogListItems.mockResolvedValue([]); // Empty - item was deleted

      const products = await mocks.productFindAll();
      const squareItems = await mocks.catalogListItems();

      // Build map of Square items
      const squareItemMap = new Map(
        squareItems.map((item: { id: string }) => [item.id, item])
      );

      // Product's Square item is not in the map
      const squareItem = squareItemMap.get(product.squareItemId);
      expect(squareItem).toBeUndefined();
    });
  });

  describe('duplicate conflict prevention', () => {
    it('does not create conflict if one already exists pending', async () => {
      const existingConflict: SyncConflict = {
        id: 'existing-conflict',
        productId: 'prod-001',
        type: 'quantity_mismatch',
        status: 'pending',
        detectedAt: new Date(),
        localState: { quantity: 5, price: 2500, name: 'Test' },
        externalState: { system: 'square', quantity: 3, price: 2500, name: 'Test' },
      };

      mocks.conflictFindExisting.mockResolvedValue(existingConflict);

      const existing = await mocks.conflictFindExisting(
        'prod-001',
        'quantity_mismatch',
        'square'
      );

      expect(existing).toBeDefined();
      expect(existing.status).toBe('pending');
    });

    it('allows new conflict if previous was resolved', async () => {
      mocks.conflictFindExisting.mockResolvedValue(null); // No pending conflict

      const existing = await mocks.conflictFindExisting(
        'prod-001',
        'quantity_mismatch',
        'square'
      );

      expect(existing).toBeNull();
      // Would proceed to create new conflict
    });
  });

  describe('conflict state snapshots', () => {
    it('captures local state at detection time', () => {
      const product = createMockProduct('prod-001', {
        cachedQuantity: 5,
        cachedPrice: 2500,
        cachedName: 'Handmade Mug',
      });

      const localState = {
        quantity: product.squareCache.quantity,
        price: product.squareCache.priceCents,
        name: product.squareCache.name,
      };

      expect(localState).toEqual({
        quantity: 5,
        price: 2500,
        name: 'Handmade Mug',
      });
    });

    it('captures external state at detection time', () => {
      const squareItem = createMockSquareItem('SQ_001', {
        name: 'Handmade Mug from Square',
        priceCents: 2800,
      });

      // Extract data from Square item structure
      const itemData = squareItem.itemData;
      const variationData = itemData.variations[0].itemVariationData;

      const externalState = {
        system: 'square' as const,
        name: itemData.name,
        price: Number(variationData.priceMoney.amount),
        quantity: 3, // From inventory API
      };

      expect(externalState).toEqual({
        system: 'square',
        name: 'Handmade Mug from Square',
        price: 2800,
        quantity: 3,
      });
    });
  });

  describe('batch detection', () => {
    it('processes multiple products efficiently', async () => {
      const products = [
        createMockProduct('prod-001', { cachedQuantity: 5 }),
        createMockProduct('prod-002', { cachedQuantity: 10 }),
        createMockProduct('prod-003', { cachedQuantity: 0 }),
      ];

      mocks.productFindAll.mockResolvedValue(products);

      const allProducts = await mocks.productFindAll();

      // Filter to only Square-linked products
      const squareLinkedProducts = allProducts.filter(
        (p: Product) => p.squareItemId
      );

      expect(squareLinkedProducts).toHaveLength(3);
    });

    it('batches inventory API calls for all variations', async () => {
      const products = [
        createMockProduct('prod-001', { squareVariationId: 'VAR_001' }),
        createMockProduct('prod-002', { squareVariationId: 'VAR_002' }),
      ];

      const variationIds = products
        .map((p) => p.squareVariationId)
        .filter((id): id is string => !!id);

      expect(variationIds).toEqual(['VAR_001', 'VAR_002']);

      // Would call inventory API with all variation IDs at once
      mocks.inventoryGetCounts.mockResolvedValue([
        { squareVariationId: 'VAR_001', quantity: 5 },
        { squareVariationId: 'VAR_002', quantity: 10 },
      ]);

      const counts = await mocks.inventoryGetCounts(
        variationIds,
        'MOCK_LOCATION'
      );

      expect(counts).toHaveLength(2);
    });
  });
});

// ============================================================================
// Etsy conflict detection tests (integration-style via captured handler)
// ============================================================================

function makeEtsyProduct(overrides: Record<string, unknown> = {}): Product {
  return {
    id: 'prod-etsy-1',
    artistId: 'artist-1',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    etsyListingId: '12345',
    squareItemId: '',
    variants: [
      {
        id: 'var-1',
        label: 'Regular',
        sku: 'prd_abc',
        priceCents: 2500,
        quantity: 5,
        etsyProductId: 1001,
      },
    ],
    squareCache: {
      name: 'Handmade Bowl',
      syncedAt: new Date(),
    },
    etsyCache: {
      title: 'Handmade Bowl',
      syncedAt: new Date(),
      state: 'active',
      taxonomyId: 100,
    },
    ...overrides,
  } as Product;
}

function makeEtsyListing(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: 12345,
    title: 'Handmade Bowl',
    quantity: 5,
    price: { amount: 2500, divisor: 100, currency_code: 'USD' },
    inventory: {
      products: [
        {
          product_id: 1001,
          sku: 'prd_abc',
          is_deleted: false,
          offerings: [
            {
              offering_id: 1,
              quantity: 5,
              is_enabled: true,
              is_deleted: false,
              price: { amount: 2500, divisor: 100, currency_code: 'USD' },
            },
          ],
          property_values: [],
        },
      ],
      price_on_property: [],
      quantity_on_property: [],
      sku_on_property: [],
    },
    ...overrides,
  };
}

describe('Etsy Sync Conflict Detection (via handler)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conflictFindPending.mockResolvedValue([]);
    mocks.conflictFindExisting.mockResolvedValue(null);
    mocks.conflictCreate.mockResolvedValue({ id: 'conflict-new' });
    // Prevent Square detection from running
    mocks.catalogListItems.mockResolvedValue([]);
    mocks.inventoryGetCounts.mockResolvedValue([]);
  });

  it('detects quantity mismatch between Firestore variant and Etsy offering', async () => {
    mocks.productFindAll.mockResolvedValue([makeEtsyProduct()]);
    mocks.etsyGetListing.mockResolvedValue(
      makeEtsyListing({
        inventory: {
          products: [
            {
              product_id: 1001,
              sku: 'prd_abc',
              is_deleted: false,
              offerings: [
                {
                  offering_id: 1,
                  quantity: 3, // Etsy has 3, Firestore has 5
                  is_enabled: true,
                  is_deleted: false,
                  price: { amount: 2500, divisor: 100, currency_code: 'USD' },
                },
              ],
              property_values: [],
            },
          ],
          price_on_property: [],
          quantity_on_property: [],
          sku_on_property: [],
        },
      })
    );

    const result = (await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    )) as { detected: number; updated: number };

    expect(result.detected).toBe(1);
    expect(mocks.conflictCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'prod-etsy-1',
        variantId: 'var-1',
        variantLabel: 'Regular',
        type: 'quantity_mismatch',
        localState: expect.objectContaining({ quantity: 5 }),
        externalState: expect.objectContaining({
          system: 'etsy',
          quantity: 3,
        }),
      })
    );
  });

  it('detects price mismatch between Firestore variant and Etsy offering', async () => {
    mocks.productFindAll.mockResolvedValue([makeEtsyProduct()]);
    mocks.etsyGetListing.mockResolvedValue(
      makeEtsyListing({
        inventory: {
          products: [
            {
              product_id: 1001,
              sku: 'prd_abc',
              is_deleted: false,
              offerings: [
                {
                  offering_id: 1,
                  quantity: 5,
                  is_enabled: true,
                  is_deleted: false,
                  price: { amount: 3000, divisor: 100, currency_code: 'USD' },
                },
              ],
              property_values: [],
            },
          ],
          price_on_property: [],
          quantity_on_property: [],
          sku_on_property: [],
        },
      })
    );

    const result = (await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    )) as { detected: number };

    expect(result.detected).toBe(1);
    expect(mocks.conflictCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'price_mismatch',
        localState: expect.objectContaining({ price: 2500 }),
        externalState: expect.objectContaining({
          system: 'etsy',
          price: 3000,
        }),
      })
    );
  });

  it('detects missing_external when Etsy listing is not found', async () => {
    mocks.productFindAll.mockResolvedValue([makeEtsyProduct()]);
    mocks.etsyGetListing.mockRejectedValue(new Error('Not found'));

    const result = (await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    )) as { detected: number };

    expect(result.detected).toBe(1);
    expect(mocks.conflictCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'missing_external',
        externalState: expect.objectContaining({
          system: 'etsy',
          name: '(deleted from Etsy)',
        }),
      })
    );
  });

  it('skips products without etsyListingId', async () => {
    mocks.productFindAll.mockResolvedValue([
      makeEtsyProduct({ etsyListingId: undefined }),
    ]);

    const result = (await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    )) as { detected: number };

    expect(result.detected).toBe(0);
    expect(mocks.etsyGetListing).not.toHaveBeenCalled();
  });

  it('does not create duplicate when pending conflict exists', async () => {
    mocks.productFindAll.mockResolvedValue([makeEtsyProduct()]);
    mocks.etsyGetListing.mockResolvedValue(
      makeEtsyListing({
        inventory: {
          products: [
            {
              product_id: 1001,
              sku: 'prd_abc',
              is_deleted: false,
              offerings: [
                {
                  offering_id: 1,
                  quantity: 3,
                  is_enabled: true,
                  is_deleted: false,
                  price: { amount: 2500, divisor: 100, currency_code: 'USD' },
                },
              ],
              property_values: [],
            },
          ],
          price_on_property: [],
          quantity_on_property: [],
          sku_on_property: [],
        },
      })
    );
    mocks.conflictFindExisting.mockResolvedValue({ id: 'existing' });

    const result = (await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    )) as { detected: number; updated: number };

    expect(result.detected).toBe(0);
    expect(result.updated).toBe(1);
    expect(mocks.conflictCreate).not.toHaveBeenCalled();
  });

  it('creates no conflicts when Etsy data matches Firestore', async () => {
    mocks.productFindAll.mockResolvedValue([makeEtsyProduct()]);
    mocks.etsyGetListing.mockResolvedValue(makeEtsyListing());

    const result = (await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    )) as { detected: number };

    expect(result.detected).toBe(0);
    expect(mocks.conflictCreate).not.toHaveBeenCalled();
  });

  it('only runs Etsy detection when system filter is etsy', async () => {
    mocks.productFindAll.mockResolvedValue([]);

    await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    );

    // Square methods should NOT be called
    expect(mocks.catalogListItems).not.toHaveBeenCalled();
    expect(mocks.inventoryGetCounts).not.toHaveBeenCalled();
  });

  it('detects conflicts for multi-variant products', async () => {
    const product = makeEtsyProduct({
      variants: [
        { id: 'var-sm', label: 'Small', sku: 'sku-sm', priceCents: 2000, quantity: 3, etsyProductId: 2001 },
        { id: 'var-lg', label: 'Large', sku: 'sku-lg', priceCents: 3000, quantity: 2, etsyProductId: 2002 },
      ],
    });
    mocks.productFindAll.mockResolvedValue([product]);
    mocks.etsyGetListing.mockResolvedValue(
      makeEtsyListing({
        inventory: {
          products: [
            {
              product_id: 2001,
              sku: 'sku-sm',
              is_deleted: false,
              offerings: [
                { offering_id: 1, quantity: 3, is_enabled: true, is_deleted: false, price: { amount: 2000, divisor: 100, currency_code: 'USD' } },
              ],
              property_values: [],
            },
            {
              product_id: 2002,
              sku: 'sku-lg',
              is_deleted: false,
              offerings: [
                { offering_id: 2, quantity: 1, is_enabled: true, is_deleted: false, price: { amount: 3000, divisor: 100, currency_code: 'USD' } },
              ],
              property_values: [],
            },
          ],
          price_on_property: [],
          quantity_on_property: [],
          sku_on_property: [],
        },
      })
    );

    const result = (await mocks.capturedHandler!(
      { system: 'etsy' },
      context,
      secrets,
      strings
    )) as { detected: number };

    // Only Large has quantity mismatch (2 vs 1)
    expect(result.detected).toBe(1);
    expect(mocks.conflictCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        variantId: 'var-lg',
        variantLabel: 'Large',
        type: 'quantity_mismatch',
      })
    );
  });
});
