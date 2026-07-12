import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for processCatalogSyncRequest.
 *
 * Two concerns:
 *  1. Lease coordination — N rapid triggers must collapse to one
 *     downstream sync (the 5/16 burst that produced 269 504s).
 *  2. Catalog sync correctness — same input/output as the old inline
 *     handleCatalogUpdate batch path.
 */

const mocks = vi.hoisted(() => ({
  onDocumentWritten: vi.fn(),
  // CatalogSyncRequestRepository
  tryClaimLease: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  getCurrent: vi.fn(),
  // ProductRepository
  productFindAll: vi.fn(),
  updateSquareCache: vi.fn(),
  createProduct: vi.fn(),
  // ClassRepository
  listSquareCatalogItemIds: vi.fn(),
  // Square catalog service
  listItems: vi.fn(),
  getItemImageUrl: vi.fn(),
}));

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((config, handler) => {
    mocks.onDocumentWritten(config, handler);
    return handler;
  }),
}));

vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
  defineString: vi.fn((name: string) => ({ name, value: () => `mock-${name}` })),
}));

vi.mock('@maple/firebase/database', () => ({
  CatalogSyncRequestRepository: {
    tryClaimLease: mocks.tryClaimLease,
    markCompleted: mocks.markCompleted,
    markFailed: mocks.markFailed,
    getCurrent: mocks.getCurrent,
  },
  ProductRepository: {
    findAll: mocks.productFindAll,
    updateSquareCache: mocks.updateSquareCache,
    create: mocks.createProduct,
  },
  ClassRepository: {
    listSquareCatalogItemIds: mocks.listSquareCatalogItemIds,
  },
}));

vi.mock('@maple/firebase/square', () => ({
  Square: class MockSquare {
    locationId = 'LW0MMBZ';
    catalogService = {
      listItems: mocks.listItems,
      getItemImageUrl: mocks.getItemImageUrl,
    };
  },
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'] as const,
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID'] as const,
}));

// Import after mocks
import { processCatalogSyncRequest } from './process-catalog-sync-request';

type Handler = (event: unknown) => Promise<void>;
const handler = processCatalogSyncRequest as unknown as Handler;

function makeEvent(after?: Record<string, unknown>): unknown {
  return {
    data: {
      after: {
        data: () => after,
        ref: { id: 'pending' },
      },
    },
    params: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default safe state — caller can override.
  mocks.getCurrent.mockResolvedValue({
    running: false,
    requestedAt: new Date(2026, 5, 7, 12, 0, 0),
    processedAt: undefined,
  });
  mocks.productFindAll.mockResolvedValue([]);
  mocks.listItems.mockResolvedValue([]);
  mocks.listSquareCatalogItemIds.mockResolvedValue([]);
});

describe('processCatalogSyncRequest — lease coordination', () => {
  it('exits without claiming when doc is deleted (no after data)', async () => {
    await handler(makeEvent(undefined));
    expect(mocks.tryClaimLease).not.toHaveBeenCalled();
    expect(mocks.listItems).not.toHaveBeenCalled();
  });

  it('exits without claiming when processedAt >= requestedAt', async () => {
    const t = new Date(2026, 5, 7, 12, 0, 0);
    mocks.getCurrent.mockResolvedValue({
      running: false,
      requestedAt: t,
      processedAt: t,
    });
    await handler(makeEvent({ requestedAt: t, processedAt: t, running: false }));
    expect(mocks.tryClaimLease).not.toHaveBeenCalled();
  });

  it('exits when tryClaimLease returns false (another worker holds it)', async () => {
    mocks.tryClaimLease.mockResolvedValue(false);
    await handler(makeEvent({ requestedAt: new Date(), running: true }));
    expect(mocks.listItems).not.toHaveBeenCalled();
    expect(mocks.markCompleted).not.toHaveBeenCalled();
  });

  it('runs sync exactly once when lease is claimed, then marks completed', async () => {
    mocks.tryClaimLease.mockResolvedValue(true);
    mocks.productFindAll.mockResolvedValue([]);
    mocks.listItems.mockResolvedValue([]);

    await handler(makeEvent({ requestedAt: new Date(), running: false }));

    expect(mocks.tryClaimLease).toHaveBeenCalledTimes(1);
    expect(mocks.listItems).toHaveBeenCalledTimes(1);
    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
    expect(mocks.markFailed).not.toHaveBeenCalled();
  });

  it('marks failed and re-throws when the sync errors', async () => {
    mocks.tryClaimLease.mockResolvedValue(true);
    mocks.listItems.mockRejectedValue(new Error('Square 500'));

    await expect(
      handler(makeEvent({ requestedAt: new Date(), running: false }))
    ).rejects.toThrow('Square 500');

    expect(mocks.markFailed).toHaveBeenCalledTimes(1);
    expect(mocks.markCompleted).not.toHaveBeenCalled();
  });

  it('50 concurrent triggers result in exactly one sync (burst → one)', async () => {
    // Simulate a 50-event burst: the first invocation claims the lease,
    // the other 49 see it held and exit fast. tryClaimLease returns true
    // exactly once.
    let claimedOnce = false;
    mocks.tryClaimLease.mockImplementation(async () => {
      if (claimedOnce) return false;
      claimedOnce = true;
      return true;
    });
    mocks.productFindAll.mockResolvedValue([]);
    mocks.listItems.mockResolvedValue([]);

    const event = makeEvent({ requestedAt: new Date(), running: false });
    await Promise.all(
      Array.from({ length: 50 }, () => handler(event))
    );

    expect(mocks.listItems).toHaveBeenCalledTimes(1);
    expect(mocks.markCompleted).toHaveBeenCalledTimes(1);
  });
});

describe('processCatalogSyncRequest — catalog sync correctness', () => {
  beforeEach(() => {
    mocks.tryClaimLease.mockResolvedValue(true);
  });

  it('updates tracked products and creates drafts for new Square items', async () => {
    mocks.productFindAll.mockResolvedValue([
      {
        id: 'prod-1',
        squareItemId: 'ITEM_A',
        squareCache: {
          name: 'A',
          description: 'a',
          priceCents: 100,
          sku: 'A',
          imageUrl: '',
        },
      },
    ]);
    mocks.listItems.mockResolvedValue([
      {
        id: 'ITEM_A',
        type: 'ITEM',
        version: 2,
        itemData: {
          name: 'A updated',
          variations: [
            {
              id: 'VAR_A',
              itemVariationData: { sku: 'A', priceMoney: { amount: 150n } },
            },
          ],
        },
      },
      {
        id: 'ITEM_B',
        type: 'ITEM',
        version: 1,
        itemData: {
          name: 'B new',
          variations: [
            {
              id: 'VAR_B',
              itemVariationData: { sku: 'B', priceMoney: { amount: 200n } },
            },
          ],
        },
      },
    ]);
    mocks.getItemImageUrl.mockResolvedValue('image.jpg');
    mocks.createProduct.mockResolvedValue({ id: 'prod-new' });

    await handler(makeEvent({ requestedAt: new Date(), running: false }));

    expect(mocks.updateSquareCache).toHaveBeenCalled();
    expect(mocks.createProduct).toHaveBeenCalled();
    expect(mocks.markCompleted).toHaveBeenCalledWith(
      expect.stringContaining('scanned 2')
    );
  });

  it('skips class catalog items — never mirrors them back as draft products', async () => {
    // A Square ITEM whose id is a class mirror (owned by syncClassToSquare).
    // It is untracked as a Product, so without the guard it would be created
    // as a phantom draft. The guard must skip it instead.
    mocks.productFindAll.mockResolvedValue([]);
    mocks.listSquareCatalogItemIds.mockResolvedValue(['CLASS_ITEM_1']);
    mocks.listItems.mockResolvedValue([
      {
        id: 'CLASS_ITEM_1',
        type: 'ITEM',
        version: 3,
        itemData: {
          name: 'Intro to Pottery',
          variations: [
            {
              id: 'CLASS_VAR_1',
              itemVariationData: { sku: '', priceMoney: { amount: 4500n } },
            },
          ],
        },
      },
      {
        id: 'ITEM_REAL',
        type: 'ITEM',
        version: 1,
        itemData: {
          name: 'Real Product',
          variations: [
            {
              id: 'VAR_REAL',
              itemVariationData: { sku: 'R', priceMoney: { amount: 200n } },
            },
          ],
        },
      },
    ]);
    mocks.getItemImageUrl.mockResolvedValue('img');
    mocks.createProduct.mockResolvedValue({ id: 'prod-real' });

    await handler(makeEvent({ requestedAt: new Date(), running: false }));

    // Exactly one create — for the real product, not the class item.
    expect(mocks.createProduct).toHaveBeenCalledTimes(1);
    expect(mocks.createProduct).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Real Product' }),
      expect.objectContaining({ squareItemId: 'ITEM_REAL' })
    );
    // The class item was scanned but skipped (2 scanned, 1 created, 1 skipped).
    expect(mocks.markCompleted).toHaveBeenCalledWith(
      expect.stringContaining('scanned 2')
    );
    expect(mocks.markCompleted).toHaveBeenCalledWith(
      expect.stringContaining('skipped 1')
    );
  });

  it('skips non-ITEM catalog objects', async () => {
    mocks.listItems.mockResolvedValue([
      { id: 'CAT_1', type: 'CATEGORY' },
      { id: 'TAX_1', type: 'TAX' },
    ]);

    await handler(makeEvent({ requestedAt: new Date(), running: false }));

    expect(mocks.createProduct).not.toHaveBeenCalled();
    expect(mocks.updateSquareCache).not.toHaveBeenCalled();
    expect(mocks.markCompleted).toHaveBeenCalledWith(
      expect.stringContaining('scanned 2')
    );
  });

  it('parallelizes image fetches (concurrent calls to getItemImageUrl)', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `ITEM_${i}`);
    mocks.listItems.mockResolvedValue(
      ids.map((id) => ({
        id,
        type: 'ITEM',
        version: 1,
        itemData: {
          name: id,
          variations: [
            {
              id: `VAR_${id}`,
              itemVariationData: { sku: id, priceMoney: { amount: 100n } },
            },
          ],
        },
      }))
    );
    mocks.getItemImageUrl.mockResolvedValue('img');
    mocks.createProduct.mockResolvedValue({ id: 'new' });

    await handler(makeEvent({ requestedAt: new Date(), running: false }));

    expect(mocks.getItemImageUrl).toHaveBeenCalledTimes(10);
  });
});
