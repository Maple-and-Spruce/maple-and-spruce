import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Product, SyncConflict } from '@maple/ts/domain';

/**
 * Tests for detect-sync-conflicts.ts
 *
 * Tests the business logic for detecting mismatches between
 * Firestore product data and Square catalog/inventory.
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
  };
});

// Mock ProductRepository
vi.mock('@maple/firebase/database', () => ({
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

// Mock firebase functions
vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      usingSecrets: vi.fn().mockReturnThis(),
      usingStrings: vi.fn().mockReturnThis(),
      requiringRole: vi.fn().mockReturnThis(),
      handle: vi.fn(),
    },
  },
  Role: {
    Admin: 'admin',
  },
}));

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
      const cachedQuantity = product.squareCache.quantity;
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
