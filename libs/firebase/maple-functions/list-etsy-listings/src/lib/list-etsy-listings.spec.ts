import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for listEtsyListings Cloud Function
 *
 * Focus: the cross-reference logic that maps Etsy listings to Firestore
 * Products and flags multi-variant listings as unsupported for import.
 */

const mocks = vi.hoisted(() => {
  return {
    getListings: vi.fn(),
    findByEtsyListingIds: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: { getTokens: vi.fn() },
  ProductRepository: {
    findByEtsyListingIds: mocks.findByEtsyListingIds,
  },
}));

vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    listings = { getListings: mocks.getListings };
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

import './list-etsy-listings';

const secrets = { ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret' };
const strings = { ETSY_REDIRECT_URI: 'https://example.com/callback' };

function makeListing(
  overrides: Partial<{
    listing_id: number;
    title: string;
    variants: number;
  }> = {}
) {
  const listingId = overrides.listing_id ?? 1001;
  const variants = overrides.variants ?? 1;
  return {
    listing_id: listingId,
    title: overrides.title ?? `Listing ${listingId}`,
    inventory: {
      products: Array.from({ length: variants }, (_, i) => ({
        product_id: i + 1,
        offerings: [],
        property_values: [],
      })),
    },
  };
}

describe('listEtsyListings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('flags listings as imported when a matching Product exists', async () => {
    mocks.getListings.mockResolvedValue({
      count: 2,
      results: [
        makeListing({ listing_id: 1001, title: 'Imported' }),
        makeListing({ listing_id: 1002, title: 'Not imported' }),
      ],
    });
    mocks.findByEtsyListingIds.mockResolvedValue([
      { id: 'prod-abc', etsyListingId: '1001' },
    ]);

    const result = (await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      secrets,
      strings
    )) as { listings: { imported: boolean; productId?: string }[] };

    expect(result.listings[0].imported).toBe(true);
    expect(result.listings[0].productId).toBe('prod-abc');
    expect(result.listings[1].imported).toBe(false);
    expect(result.listings[1].productId).toBeUndefined();
  });

  it('flags multi-variant listings as not simple', async () => {
    mocks.getListings.mockResolvedValue({
      count: 2,
      results: [
        makeListing({ listing_id: 2001, variants: 1 }),
        makeListing({ listing_id: 2002, variants: 3 }),
      ],
    });
    mocks.findByEtsyListingIds.mockResolvedValue([]);

    const result = (await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      secrets,
      strings
    )) as {
      listings: { variantCount: number; isSimple: boolean }[];
    };

    expect(result.listings[0].variantCount).toBe(1);
    expect(result.listings[0].isSimple).toBe(true);
    expect(result.listings[1].variantCount).toBe(3);
    expect(result.listings[1].isSimple).toBe(false);
  });

  it('defaults variantCount to 1 when inventory is missing', async () => {
    mocks.getListings.mockResolvedValue({
      count: 1,
      results: [
        {
          listing_id: 3001,
          title: 'No inventory data',
        },
      ],
    });
    mocks.findByEtsyListingIds.mockResolvedValue([]);

    const result = (await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      secrets,
      strings
    )) as { listings: { variantCount: number; isSimple: boolean }[] };

    expect(result.listings[0].variantCount).toBe(1);
    expect(result.listings[0].isSimple).toBe(true);
  });

  it('applies state/limit/offset from the request', async () => {
    mocks.getListings.mockResolvedValue({ count: 0, results: [] });
    mocks.findByEtsyListingIds.mockResolvedValue([]);

    await mocks.capturedHandler!(
      { state: 'draft', limit: 25, offset: 50 },
      { uid: 'admin-1' },
      secrets,
      strings
    );

    expect(mocks.getListings).toHaveBeenCalledWith('draft', {
      limit: 25,
      offset: 50,
      includes: 'Images,Inventory',
    });
  });

  it('defaults to state=active when not provided', async () => {
    mocks.getListings.mockResolvedValue({ count: 0, results: [] });
    mocks.findByEtsyListingIds.mockResolvedValue([]);

    await mocks.capturedHandler!({}, { uid: 'admin-1' }, secrets, strings);

    expect(mocks.getListings).toHaveBeenCalledWith(
      'active',
      expect.objectContaining({ limit: 100, offset: 0 })
    );
  });
});
