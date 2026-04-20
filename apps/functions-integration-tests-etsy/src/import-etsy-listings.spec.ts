/**
 * Integration tests for importEtsyListings Cloud Function.
 *
 * Covers the full pull-only import pipeline:
 *   Etsy listing fetch (mocked) → Square catalog create (mocked)
 *   → Firestore Product + etsyCache + etsy-imports snapshot.
 *
 * Scope caveat: the monolithic mock server doesn't currently implement
 * Square's /v2/inventory/changes or /v2/catalog/images endpoints. Until
 * those land (tracked by the mock-server-split issue), these tests seed
 * listings with quantity=0 and no images so the import skips the
 * best-effort inventory + image-copy paths. Unit tests cover those paths
 * via vi.mock() on the Square services directly.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  ImportEtsyListingsRequest,
  ImportEtsyListingsResponse,
} from '@maple/ts/firebase/api-types';
import { makeListing } from '@maple/firebase/etsy-test-mock-server';
import { setMockListings, resetMock } from './helpers/etsy-mock-client';

describe('importEtsyListings', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdminUser = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
    await setFirestoreDoc('_config', 'etsy-tokens', {
      accessToken: '11111.valid-access-token',
      refreshToken: '11111.valid-refresh',
      expiresAt: Date.now() + 3600000,
      shopId: '22222',
      userId: '11111',
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  beforeEach(async () => {
    await resetMock();
  });

  it('rejects non-admin users', async () => {
    const result = await callFunction<ImportEtsyListingsRequest>({
      functionName: 'importEtsyListings',
      data: {
        listings: [{ listingId: '1' }],
        artistId: 'a',
        status: 'active',
      },
      idToken: nonAdminUser.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('returns empty results for empty input', async () => {
    const result = await callFunction<
      ImportEtsyListingsRequest,
      ImportEtsyListingsResponse
    >({
      functionName: 'importEtsyListings',
      data: { listings: [], artistId: 'a', status: 'active' },
      idToken: adminUser.idToken,
    });
    expect(result.status).toBe(200);
    expect(result.data!.results).toEqual([]);
    expect(result.data!.successCount).toBe(0);
  });

  it('imports a multi-variant listing with all variants', async () => {
    await setMockListings([
      makeListing({
        listing_id: 9001,
        title: 'Multi-variant',
        productSkus: ['v1', 'v2', 'v3'],
        quantity: 0, // avoid hitting inventory endpoint (not in monolith mock)
        imageUrls: [], // avoid hitting image endpoint (not in monolith mock)
      }),
    ]);

    const result = await callFunction<
      ImportEtsyListingsRequest,
      ImportEtsyListingsResponse
    >({
      functionName: 'importEtsyListings',
      data: {
        listings: [{ listingId: '9001' }],
        artistId: 'artist-1',
        status: 'active',
      },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.successCount).toBe(1);
    const row = result.data!.results[0];
    expect(row.success).toBe(true);
    const productId = row.productId!;
    expect(productId).toBeTruthy();

    // Firestore product has 3 variants
    const product = await getFirestoreDoc('products', productId);
    expect(product).not.toBeNull();
    expect(product!.etsyListingId).toBe('9001');
    expect(product!.artistId).toBe('artist-1');

    // Variants array should have 3 entries matching the SKUs
    const variants = product!.variants as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(3);
    expect(variants.map((v) => v.sku)).toEqual(
      expect.arrayContaining(['v1', 'v2', 'v3'])
    );

    // Raw snapshot records the variant count
    const snapshot = await getFirestoreDoc('etsy-imports', productId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.variantCount).toBe(3);
  });

  it('short-circuits listings that are already imported', async () => {
    await setFirestoreDoc('products', 'existing-prod', {
      artistId: 'artist-old',
      status: 'active',
      squareItemId: 'sq-item-old',
      squareVariationId: 'sq-var-old',
      etsyListingId: '9100',
      squareCache: {
        name: 'Already here',
        priceCents: 1000,
        quantity: 0,
        sku: 'sku-old',
        syncedAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await setMockListings([
      makeListing({ listing_id: 9100, title: 'Already imported', quantity: 0 }),
    ]);

    const result = await callFunction<
      ImportEtsyListingsRequest,
      ImportEtsyListingsResponse
    >({
      functionName: 'importEtsyListings',
      data: {
        listings: [{ listingId: '9100' }],
        artistId: 'artist-new',
        status: 'active',
      },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.results[0].success).toBe(false);
    expect(result.data!.results[0].errorCode).toBe('ALREADY_IMPORTED');
    expect(result.data!.results[0].productId).toBe('existing-prod');
  });

  it('imports a simple listing end-to-end: Square + Product + etsyCache + snapshot', async () => {
    await setMockListings([
      makeListing({
        listing_id: 9200,
        title: 'Import Me',
        description: 'A thing',
        priceAmount: 3500,
        priceDivisor: 100,
        taxonomy_id: 99,
        tags: ['pottery', 'gift'],
        quantity: 0, // avoid hitting inventory endpoint (not in monolith mock)
        imageUrls: [], // avoid hitting image endpoint (not in monolith mock)
        productSkus: ['etsy-sku-9200'],
      }),
    ]);

    const result = await callFunction<
      ImportEtsyListingsRequest,
      ImportEtsyListingsResponse
    >({
      functionName: 'importEtsyListings',
      data: {
        listings: [{ listingId: '9200' }],
        artistId: 'artist-import',
        categoryId: 'cat-import',
        status: 'active',
      },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.successCount).toBe(1);
    const row = result.data!.results[0];
    expect(row.success).toBe(true);
    const productId = row.productId!;
    expect(productId).toBeTruthy();

    // Firestore product exists with Etsy + Square links
    const product = await getFirestoreDoc('products', productId);
    expect(product).not.toBeNull();
    expect(product!.etsyListingId).toBe('9200');
    expect(product!.artistId).toBe('artist-import');
    expect(product!.categoryId).toBe('cat-import');
    expect(product!.status).toBe('active');

    // Single variant with the provided SKU
    const variants = product!.variants as Array<Record<string, unknown>>;
    expect(variants).toHaveLength(1);
    expect(variants[0].sku).toBe('etsy-sku-9200');

    // etsyCache populated
    const etsyCache = product!.etsyCache as Record<string, unknown>;
    expect(etsyCache.title).toBe('Import Me');
    expect(etsyCache.priceCents).toBe(3500);
    expect(etsyCache.taxonomyId).toBe(99);

    // Raw snapshot written to etsy-imports collection
    const snapshot = await getFirestoreDoc('etsy-imports', productId);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.listingId).toBe('9200');
    expect(snapshot!.importedBy).toBe(adminUser.uid);
    expect(snapshot!.variantCount).toBe(1);
  });

  it('reports LISTING_NOT_FOUND when Etsy returns 404', async () => {
    // No listings seeded — the mock will 404 on any listing id.
    const result = await callFunction<
      ImportEtsyListingsRequest,
      ImportEtsyListingsResponse
    >({
      functionName: 'importEtsyListings',
      data: {
        listings: [{ listingId: '99999' }],
        artistId: 'artist-1',
        status: 'active',
      },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.results[0].success).toBe(false);
    expect(result.data!.results[0].errorCode).toBe('LISTING_NOT_FOUND');
  });
});
