import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for pushProductToEtsy Cloud Function
 *
 * Validates: input validation, draft listing creation, image upload,
 * multi-variant inventory, Firestore updates, and activation.
 */

const mocks = vi.hoisted(() => {
  return {
    findById: vi.fn(),
    updateEtsyCache: vi.fn(),
    updateVariants: vi.fn(),
    getCategoryTemplate: vi.fn(),
    getArtistTemplate: vi.fn(),
    createDraftListing: vi.fn(),
    uploadListingImage: vi.fn(),
    activateListing: vi.fn(),
    updateInventory: vi.fn(),
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
      createDraftListing: mocks.createDraftListing,
      uploadListingImage: mocks.uploadListingImage,
      activateListing: mocks.activateListing,
    };
    inventory = {
      updateInventory: mocks.updateInventory,
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

import './push-product-to-etsy';

const secrets = { ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret' };
const strings = { ETSY_REDIRECT_URI: 'https://example.com/callback' };
const context = { uid: 'admin-1' };

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    artistId: 'artist-1',
    categoryId: 'cat-1',
    status: 'active',
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
      imageUrl: 'https://images.example.com/bowl.jpg',
      syncedAt: new Date(),
    },
    etsyListingId: undefined,
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
    state: 'draft',
    ...overrides,
  };
}

describe('pushProductToEtsy', () => {
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

  it('returns error when product has no variants', async () => {
    mocks.findById.mockResolvedValue(makeProduct({ variants: [] }));

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('at least one variant');
  });

  it('returns error when product already has an Etsy listing', async () => {
    mocks.findById.mockResolvedValue(
      makeProduct({ etsyListingId: '12345' })
    );

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('already linked');
  });

  it('returns error when no taxonomy_id is available', async () => {
    mocks.findById.mockResolvedValue(makeProduct());
    mocks.getCategoryTemplate.mockResolvedValue(undefined);
    mocks.getArtistTemplate.mockResolvedValue(undefined);

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean; error: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('taxonomy_id');
  });

  it('creates a draft listing and updates Firestore on success', async () => {
    const product = makeProduct();
    mocks.findById.mockResolvedValue(product);
    mocks.getCategoryTemplate.mockResolvedValue({
      taxonomyId: 1234,
      tags: ['handmade'],
      whoMade: 'someone_else',
      whenMade: 'made_to_order',
    });
    mocks.getArtistTemplate.mockResolvedValue(undefined);

    const listing = makeEtsyListing();
    mocks.createDraftListing.mockResolvedValue(listing);

    // Mock the refetch after updates
    mocks.findById.mockResolvedValueOnce(product).mockResolvedValueOnce({
      ...product,
      etsyListingId: '98765',
    });

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean; etsyListingId: string };

    expect(result.success).toBe(true);
    expect(result.etsyListingId).toBe('98765');

    // Verify createDraftListing was called with correct data
    expect(mocks.createDraftListing).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Handmade Bowl',
        price: 25,
        quantity: 5,
        taxonomy_id: 1234,
        who_made: 'someone_else',
        when_made: 'made_to_order',
      })
    );

    // Verify Firestore was updated
    expect(mocks.updateEtsyCache).toHaveBeenCalledWith(
      'prod-1',
      '98765',
      expect.objectContaining({
        title: 'Handmade Bowl',
        state: 'draft',
      })
    );
  });

  it('handles multi-variant products with inventory update', async () => {
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

    const listing = makeEtsyListing();
    mocks.createDraftListing.mockResolvedValue(listing);
    mocks.updateInventory.mockResolvedValue({
      products: [
        { product_id: 501, sku: 'sku-sm', offerings: [], property_values: [] },
        { product_id: 502, sku: 'sku-lg', offerings: [], property_values: [] },
      ],
    });

    // Refetch
    mocks.findById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce({ ...product, etsyListingId: '98765' });

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean };

    expect(result.success).toBe(true);

    // Total quantity should be 3 + 2 = 5
    expect(mocks.createDraftListing).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 5 })
    );

    // Inventory should be updated with variant data
    expect(mocks.updateInventory).toHaveBeenCalledWith(
      98765,
      expect.objectContaining({
        products: expect.arrayContaining([
          expect.objectContaining({ sku: 'sku-sm' }),
          expect.objectContaining({ sku: 'sku-lg' }),
        ]),
      })
    );

    // Variant etsyProductId mappings should be saved
    expect(mocks.updateVariants).toHaveBeenCalledWith(
      'prod-1',
      expect.arrayContaining([
        expect.objectContaining({ id: 'var-1', etsyProductId: 501 }),
        expect.objectContaining({ id: 'var-2', etsyProductId: 502 }),
      ])
    );
  });

  it('activates the listing when activateAfterPush is true', async () => {
    const product = makeProduct();
    mocks.findById.mockResolvedValue(product);
    mocks.getCategoryTemplate.mockResolvedValue({ taxonomyId: 1234 });
    mocks.getArtistTemplate.mockResolvedValue(undefined);
    mocks.createDraftListing.mockResolvedValue(makeEtsyListing());
    mocks.activateListing.mockResolvedValue({
      ...makeEtsyListing(),
      state: 'active',
    });

    mocks.findById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce({ ...product, etsyListingId: '98765' });

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1', activateAfterPush: true },
      context,
      secrets,
      strings
    )) as { success: boolean };

    expect(result.success).toBe(true);
    expect(mocks.activateListing).toHaveBeenCalledWith(98765);

    // Should update cache with active state
    expect(mocks.updateEtsyCache).toHaveBeenCalledWith(
      'prod-1',
      '98765',
      expect.objectContaining({ state: 'active' })
    );
  });

  it('succeeds even if image upload fails (best-effort)', async () => {
    const product = makeProduct();
    mocks.findById.mockResolvedValue(product);
    mocks.getCategoryTemplate.mockResolvedValue({ taxonomyId: 1234 });
    mocks.getArtistTemplate.mockResolvedValue(undefined);
    mocks.createDraftListing.mockResolvedValue(makeEtsyListing());

    // Image download will fail because fetch is not mocked to return success.
    // The function should still succeed.
    mocks.findById
      .mockResolvedValueOnce(product)
      .mockResolvedValueOnce({ ...product, etsyListingId: '98765' });

    const result = (await mocks.capturedHandler!(
      { productId: 'prod-1' },
      context,
      secrets,
      strings
    )) as { success: boolean };

    expect(result.success).toBe(true);
  });
});
