/**
 * Integration tests for importEtsyListings Cloud Function.
 *
 * Covers the full pull-only import pipeline:
 *   Etsy listing fetch (mocked) → Square catalog create (mocked)
 *   → Firestore Product + etsyCache + etsy-imports snapshot.
 *
 * The per-service Square mock server provides /v2/inventory/changes/batch-create
 * and /v2/catalog/images endpoints, so tests exercise inventory + image-copy
 * paths end-to-end.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  EMULATOR_CONFIG,
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

  it('flags multi-variant listings without calling Square', async () => {
    await setMockListings([
      makeListing({
        listing_id: 9001,
        title: 'Multi-variant',
        productSkus: ['v1', 'v2', 'v3'],
        quantity: 0,
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
    expect(result.data!.successCount).toBe(0);
    expect(result.data!.results[0].success).toBe(false);
    expect(result.data!.results[0].errorCode).toBe('MULTI_VARIANT_NOT_SUPPORTED');
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
        quantity: 0,
        imageUrls: [],
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

  it('imports a listing with inventory and images (exercises Square inventory + image endpoints)', async () => {
    // Use mock image URL that the Etsy mock server serves at /mock-images/:name
    const mockImageUrl = `${EMULATOR_CONFIG.etsyMockServerUrl}/mock-images/pottery-bowl.jpg`;

    await setMockListings([
      makeListing({
        listing_id: 9300,
        title: 'Handmade Pottery Bowl',
        description: 'A beautiful stoneware bowl',
        priceAmount: 4800,
        priceDivisor: 100,
        taxonomy_id: 42,
        tags: ['pottery', 'stoneware', 'bowl'],
        quantity: 5,
        imageUrls: [mockImageUrl],
        productSkus: ['etsy-sku-9300'],
      }),
    ]);

    const result = await callFunction<
      ImportEtsyListingsRequest,
      ImportEtsyListingsResponse
    >({
      functionName: 'importEtsyListings',
      data: {
        listings: [{ listingId: '9300' }],
        artistId: 'artist-inventory',
        categoryId: 'cat-pottery',
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

    // Firestore product exists with correct data
    const product = await getFirestoreDoc('products', productId);
    expect(product).not.toBeNull();
    expect(product!.etsyListingId).toBe('9300');
    expect(product!.artistId).toBe('artist-inventory');
    expect(product!.status).toBe('active');

    // etsyCache reflects the inventory quantity
    const etsyCache = product!.etsyCache as Record<string, unknown>;
    expect(etsyCache.title).toBe('Handmade Pottery Bowl');
    expect(etsyCache.priceCents).toBe(4800);
    expect(etsyCache.quantity).toBe(5);
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
