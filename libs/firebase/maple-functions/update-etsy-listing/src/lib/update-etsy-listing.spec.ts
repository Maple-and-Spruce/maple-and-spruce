import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for updateEtsyListing Cloud Function
 *
 * Validates: input validation, listing update, inventory sync,
 * and Firestore cache updates.
 */

const mocks = vi.hoisted(() => {
  return {
    findById: vi.fn(),
    updateEtsyCache: vi.fn(),
    updateVariants: vi.fn(),
    getCategoryTemplate: vi.fn(),
    getArtistTemplate: vi.fn(),
    updateListing: vi.fn(),
    updateInventory: vi.fn(),
    setQuantity: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: { getTokens: vi.fn() },
  ProductRepository: {
    findById: mocks.findById,
    updateEtsyCache: mocks.updateEtsyCache,
    updateVariants: mocks.updateVariants,
  },
  EtsyTemplateRepository: {
    getCategoryTemplate: mocks.getCategoryTemplate,
    getArtistTemplate: mocks.getArtistTemplate,
  },
}));

vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    listings = {
      updateListing: mocks.updateListing,
    };
    inventory = {
      updateInventory: mocks.updateInventory,
      setQuantity: mocks.setQuantity,
    };
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

import './update-etsy-listing';

const secrets = { ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret' };
const strings = { ETSY_REDIRECT_URI: 'https://example.com/callback' };
const context = { uid: 'admin-1' };

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    artistId: 'artist-1',
    categoryId: 'cat-1',
    status: 'active',
    etsyListingId: '98765',
    variants: [
      {
        id: 'var-1',
        label: 'Regular',
        sku: 'prd_abc123',
        priceCents: 2500,
        quantity: 5,
      },
    ],
    squareCache: {
      name: 'Handmade Bowl',
      description: 'A lovely handmade ceramic bowl',
      syncedAt: new Date(),
    },
    ...overrides,
  };
}

function makeEtsyListing(overrides: Record<string, unknown> = {}) {
  return {
    listing_id: 98765,
    title: 'Handmade Bowl',
    description: 'A lovely handmade ceramic bowl',
    url: 'https://www.etsy.com/listing/98765',
    taxonomy_id: 1234,
    tags: ['handmade', 'ceramic'],
    state: 'active',
    ...overrides,
  };
}

describe('updateEtsyListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error when productId is missing', async () => {
    const result = (await mocks.capturedHandler!(
      {},
      context,
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toBe('productId is required');
  });

  it('returns error when product not found', async () => {
    mocks.findById.mockResolvedValue(undefined);

    const result = (await mocks.capturedHandler!(
      { productId: 'missing' },
      context,
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('returns error when product has no etsyListingId', async () => {
    mocks.findById.mockResolvedValue(
      makeProduct({ etsyListingId: undefined })
    );

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('does not have an Etsy listing');
  });

  it('updates listing and single-variant quantity on success', async () => {
    const product = makeProduct();
    mocks.findById.mockResolvedValue(product);
    mocks.getCategoryTemplate.mockResolvedValue({
      taxonomyId: 1234,
      tags: ['handmade'],
    });
    mocks.getArtistTemplate.mockResolvedValue(undefined);

    const updatedListing = makeEtsyListing();
    mocks.updateListing.mockResolvedValue(updatedListing);
    mocks.setQuantity.mockResolvedValue({
      products: [],
    });

    // Refetch
    mocks.findById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce(product);

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean; product: unknown };

    expect(result.success).toBe(true);

    expect(mocks.updateListing).toHaveBeenCalledWith(
      98765,
      expect.objectContaining({
        title: 'Handmade Bowl',
        price: 25,
        quantity: 5,
      })
    );

    // Single variant uses setQuantity
    expect(mocks.setQuantity).toHaveBeenCalledWith(98765, 5);

    // Firestore cache updated
    expect(mocks.updateEtsyCache).toHaveBeenCalledWith(
      'prod-1',
      '98765',
      expect.objectContaining({
        title: 'Handmade Bowl',
        state: 'active',
      })
    );
  });

  it('updates multi-variant inventory', async () => {
    const product = makeProduct({
      variants: [
        { id: 'var-1', label: 'Small', sku: 'sku-sm', priceCents: 2000, quantity: 3 },
        { id: 'var-2', label: 'Large', sku: 'sku-lg', priceCents: 3000, quantity: 2 },
      ],
      variantProperties: ['Size'],
    });
    mocks.findById.mockResolvedValue(product);
    mocks.getCategoryTemplate.mockResolvedValue({ taxonomyId: 1234 });
    mocks.getArtistTemplate.mockResolvedValue(undefined);
    mocks.updateListing.mockResolvedValue(makeEtsyListing());
    mocks.updateInventory.mockResolvedValue({
      products: [
        { product_id: 501, sku: 'sku-sm', offerings: [], property_values: [] },
        { product_id: 502, sku: 'sku-lg', offerings: [], property_values: [] },
      ],
    });

    mocks.findById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce(product);

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean };

    expect(result.success).toBe(true);

    // Should use updateInventory (not setQuantity) for multi-variant
    expect(mocks.updateInventory).toHaveBeenCalledWith(
      98765,
      expect.objectContaining({
        products: expect.arrayContaining([
          expect.objectContaining({ sku: 'sku-sm' }),
          expect.objectContaining({ sku: 'sku-lg' }),
        ]),
      })
    );
    expect(mocks.setQuantity).not.toHaveBeenCalled();

    // Variant etsyProductId mappings saved
    expect(mocks.updateVariants).toHaveBeenCalledWith(
      'prod-1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'var-1', etsyProductId: 501 }),
        expect.objectContaining({ id: 'var-2', etsyProductId: 502 }),
      ])
    );
  });

  it('succeeds even if inventory update fails (best-effort)', async () => {
    const product = makeProduct();
    mocks.findById.mockResolvedValue(product);
    mocks.getCategoryTemplate.mockResolvedValue({ taxonomyId: 1234 });
    mocks.getArtistTemplate.mockResolvedValue(undefined);
    mocks.updateListing.mockResolvedValue(makeEtsyListing());
    mocks.setQuantity.mockRejectedValue(new Error('Etsy API error'));

    mocks.findById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce(product);

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean };

    expect(result.success).toBe(true);
  });
});
