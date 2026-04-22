import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for resolveSyncConflict Cloud Function
 *
 * Validates Etsy-specific resolution paths: use_local (push to Etsy),
 * use_external (pull from Etsy into Firestore), and manual/ignored.
 */

const mocks = vi.hoisted(() => {
  return {
    // Repository mocks
    findById: vi.fn(),
    findConflictById: vi.fn(),
    resolveConflict: vi.fn(),
    updateCachedQuantity: vi.fn(),
    updateSquareCache: vi.fn(),
    updateVariantQuantity: vi.fn(),
    updateVariants: vi.fn(),
    // Etsy mocks
    etsyUpdateListing: vi.fn(),
    etsySetQuantity: vi.fn(),
    etsyGetInventory: vi.fn(),
    etsyUpdateInventory: vi.fn(),
    etsyStripServerFields: vi.fn(),
    // Square mocks
    squareSetQuantity: vi.fn(),
    squareUpdateItem: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: { getTokens: vi.fn() },
  ProductRepository: {
    findById: mocks.findById,
    updateCachedQuantity: mocks.updateCachedQuantity,
    updateSquareCache: mocks.updateSquareCache,
    updateVariantQuantity: mocks.updateVariantQuantity,
    updateVariants: mocks.updateVariants,
  },
  SyncConflictRepository: {
    findById: mocks.findConflictById,
    resolve: mocks.resolveConflict,
  },
}));

vi.mock('@maple/firebase/square', () => ({
  Square: class {
    inventoryService = { setQuantity: mocks.squareSetQuantity };
    catalogService = { updateItem: mocks.squareUpdateItem };
    locationId = 'loc-1';
  },
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID'],
}));

vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    listings = { updateListing: mocks.etsyUpdateListing };
    inventory = {
      setQuantity: mocks.etsySetQuantity,
      getInventory: mocks.etsyGetInventory,
      updateInventory: mocks.etsyUpdateInventory,
      stripServerFields: mocks.etsyStripServerFields,
    };
  },
}));

vi.mock('@maple/ts/validation', () => ({
  syncConflictResolutionValidation: vi.fn(() => ({
    isValid: () => true,
    getErrors: () => ({}),
  })),
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
  throwNotFound: vi.fn((entity: string, id: string) => {
    throw new Error(`${entity} ${id} not found`);
  }),
  throwInvalidArgument: vi.fn((msg: string) => {
    throw new Error(msg);
  }),
  throwFailedPrecondition: vi.fn((msg: string) => {
    throw new Error(msg);
  }),
}));

import './resolve-sync-conflict';

const secrets = {
  SQUARE_ACCESS_TOKEN: 'sq-token',
  ETSY_API_KEY: 'etsy-key',
  ETSY_SHARED_SECRET: 'etsy-secret',
};
const strings = {
  SQUARE_LOCATION_ID: 'loc-1',
  ETSY_REDIRECT_URI: 'https://example.com/callback',
};
const context = { uid: 'admin-1' };

function makeEtsyConflict(
  type: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 'conflict-1',
    productId: 'prod-1',
    variantId: 'var-1',
    variantLabel: 'Regular',
    type,
    status: 'pending',
    detectedAt: new Date(),
    localState: { quantity: 5, price: 2500, name: 'Handmade Bowl' },
    externalState: {
      system: 'etsy',
      quantity: 3,
      price: 3000,
      name: 'Handmade Bowl',
    },
    ...overrides,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    artistId: 'artist-1',
    status: 'active',
    etsyListingId: '12345',
    squareItemId: 'sq-1',
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
    ...overrides,
  };
}

describe('resolveSyncConflict — Etsy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveConflict.mockResolvedValue({
      ...makeEtsyConflict('quantity_mismatch'),
      status: 'resolved',
      resolution: 'use_local',
    });
  });

  describe('use_local (push to Etsy)', () => {
    it('pushes local quantity to Etsy for quantity_mismatch', async () => {
      const conflict = makeEtsyConflict('quantity_mismatch');
      mocks.findConflictById.mockResolvedValue(conflict);
      mocks.findById.mockResolvedValue(makeProduct());
      mocks.etsySetQuantity.mockResolvedValue({});

      await mocks.capturedHandler!(
        { conflictId: 'conflict-1', resolution: 'use_local' },
        context,
        secrets,
        strings
      );

      expect(mocks.etsySetQuantity).toHaveBeenCalledWith(12345, 5);
      expect(mocks.resolveConflict).toHaveBeenCalledWith(
        'conflict-1',
        'use_local',
        'admin-1',
        undefined
      );
    });

    it('pushes local price to Etsy for price_mismatch', async () => {
      const conflict = makeEtsyConflict('price_mismatch');
      mocks.findConflictById.mockResolvedValue(conflict);
      mocks.findById.mockResolvedValue(makeProduct());
      mocks.etsyUpdateListing.mockResolvedValue({});
      mocks.etsyGetInventory.mockResolvedValue({
        products: [{ offerings: [{ price: { amount: 3000, divisor: 100 }, quantity: 5, is_enabled: true }] }],
      });
      mocks.etsyStripServerFields.mockReturnValue({
        products: [{ offerings: [{ price: 30, quantity: 5, is_enabled: true }] }],
      });
      mocks.etsyUpdateInventory.mockResolvedValue({});

      await mocks.capturedHandler!(
        { conflictId: 'conflict-1', resolution: 'use_local' },
        context,
        secrets,
        strings
      );

      expect(mocks.etsyUpdateListing).toHaveBeenCalledWith(12345, { price: 25 });
      expect(mocks.etsyUpdateInventory).toHaveBeenCalled();
    });

    it('throws on missing_external (cannot recreate Etsy listing)', async () => {
      const conflict = makeEtsyConflict('missing_external');
      mocks.findConflictById.mockResolvedValue(conflict);
      mocks.findById.mockResolvedValue(makeProduct());

      await expect(
        mocks.capturedHandler!(
          { conflictId: 'conflict-1', resolution: 'use_local' },
          context,
          secrets,
          strings
        )
      ).rejects.toThrow('Cannot automatically restore deleted Etsy listing');
    });
  });

  describe('use_external (pull from Etsy)', () => {
    it('updates Firestore variant quantity from Etsy', async () => {
      const conflict = makeEtsyConflict('quantity_mismatch');
      mocks.findConflictById.mockResolvedValue(conflict);
      mocks.findById.mockResolvedValue(makeProduct());
      mocks.updateVariantQuantity.mockResolvedValue(undefined);

      await mocks.capturedHandler!(
        { conflictId: 'conflict-1', resolution: 'use_external' },
        context,
        secrets,
        strings
      );

      expect(mocks.updateVariantQuantity).toHaveBeenCalledWith('prod-1', 'var-1', 3);
    });

    it('updates Firestore variant price from Etsy', async () => {
      const conflict = makeEtsyConflict('price_mismatch');
      mocks.findConflictById.mockResolvedValue(conflict);
      const product = makeProduct();
      mocks.findById.mockResolvedValue(product);
      mocks.updateVariants.mockResolvedValue(undefined);

      await mocks.capturedHandler!(
        { conflictId: 'conflict-1', resolution: 'use_external' },
        context,
        secrets,
        strings
      );

      expect(mocks.updateVariants).toHaveBeenCalledWith(
        'prod-1',
        expect.arrayContaining([
          expect.objectContaining({ id: 'var-1', priceCents: 3000 }),
        ])
      );
    });
  });

  describe('manual and ignored', () => {
    it('resolves conflict as manual without data sync', async () => {
      const conflict = makeEtsyConflict('quantity_mismatch');
      mocks.findConflictById.mockResolvedValue(conflict);

      await mocks.capturedHandler!(
        {
          conflictId: 'conflict-1',
          resolution: 'manual',
          notes: 'Fixed manually',
        },
        context,
        secrets,
        strings
      );

      expect(mocks.etsySetQuantity).not.toHaveBeenCalled();
      expect(mocks.updateVariantQuantity).not.toHaveBeenCalled();
      expect(mocks.resolveConflict).toHaveBeenCalledWith(
        'conflict-1',
        'manual',
        'admin-1',
        'Fixed manually'
      );
    });

    it('resolves conflict as ignored', async () => {
      const conflict = makeEtsyConflict('price_mismatch');
      mocks.findConflictById.mockResolvedValue(conflict);

      await mocks.capturedHandler!(
        { conflictId: 'conflict-1', resolution: 'ignored' },
        context,
        secrets,
        strings
      );

      expect(mocks.etsyUpdateListing).not.toHaveBeenCalled();
      expect(mocks.resolveConflict).toHaveBeenCalledWith(
        'conflict-1',
        'ignored',
        'admin-1',
        undefined
      );
    });
  });
});
