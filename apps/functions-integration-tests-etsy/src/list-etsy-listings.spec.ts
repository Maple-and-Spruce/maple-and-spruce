/**
 * Integration tests for listEtsyListings Cloud Function.
 *
 * Runs in the Firebase emulator against real Firestore, with Etsy API
 * calls intercepted by the standalone etsy-test-mock-server (started via
 * tools/run-integration-tests.sh). Tests seed the mock's in-memory
 * listing store over HTTP and assert on the function's cross-reference
 * between Etsy listings and existing Products in Firestore.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  ListEtsyListingsRequest,
  ListEtsyListingsResponse,
} from '@maple/ts/firebase/api-types';
import { makeListing } from '@maple/firebase/etsy-test-mock-server';
import { setMockListings, resetMock } from './helpers/etsy-mock-client';

describe('listEtsyListings', () => {
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

    // Seed the Etsy token so the function thinks OAuth is already connected.
    // listEtsyListings reads tokenStorage.getTokens() to resolve the shop ID.
    // Token storage path is _config/etsy-tokens (see etsy-token.repository.ts).
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

  describe('Auth guard', () => {
    it('should reject unauthenticated requests', async () => {
      await setMockListings([makeListing({ listing_id: 1 })]);
      const result = await callFunction<ListEtsyListingsRequest>({
        functionName: 'listEtsyListings',
        data: {},
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<ListEtsyListingsRequest>({
        functionName: 'listEtsyListings',
        data: {},
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Happy path', () => {
    it('returns empty list when the Etsy shop has no listings', async () => {
      await setMockListings([]);

      const result = await callFunction<
        ListEtsyListingsRequest,
        ListEtsyListingsResponse
      >({
        functionName: 'listEtsyListings',
        data: {},
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.listings).toEqual([]);
      expect(result.data!.total).toBe(0);
    });

    it('returns listings with imported=false when no Products match', async () => {
      await setMockListings([
        makeListing({ listing_id: 101, title: 'Mug A' }),
        makeListing({ listing_id: 102, title: 'Mug B' }),
      ]);

      const result = await callFunction<
        ListEtsyListingsRequest,
        ListEtsyListingsResponse
      >({
        functionName: 'listEtsyListings',
        data: {},
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data!.listings).toHaveLength(2);
      for (const item of result.data!.listings) {
        expect(item.imported).toBe(false);
        expect(item.productId).toBeUndefined();
      }
      expect(result.data!.total).toBe(2);
    });

    it('flags a listing as imported when a matching Product exists', async () => {
      await setMockListings([
        makeListing({ listing_id: 201, title: 'Matched' }),
        makeListing({ listing_id: 202, title: 'Unmatched' }),
      ]);

      await setFirestoreDoc('products', 'prod-existing', {
        artistId: 'artist-1',
        status: 'active',
        squareItemId: 'sq-item-1',
        squareVariationId: 'sq-var-1',
        etsyListingId: '201',
        squareCache: {
          name: 'Matched',
          priceCents: 2500,
          quantity: 3,
          sku: 'sku-201',
          syncedAt: new Date(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await callFunction<
        ListEtsyListingsRequest,
        ListEtsyListingsResponse
      >({
        functionName: 'listEtsyListings',
        data: {},
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      const matched = result.data!.listings.find(
        (l) => l.listing.listing_id === 201
      )!;
      const unmatched = result.data!.listings.find(
        (l) => l.listing.listing_id === 202
      )!;

      expect(matched.imported).toBe(true);
      expect(matched.productId).toBe('prod-existing');
      expect(unmatched.imported).toBe(false);
    });

    it('reports variantCount and isSimple correctly', async () => {
      await setMockListings([
        makeListing({
          listing_id: 301,
          title: 'Simple',
          productSkus: ['sku-simple'],
        }),
        makeListing({
          listing_id: 302,
          title: 'Variants',
          productSkus: ['sku-a', 'sku-b', 'sku-c'],
        }),
      ]);

      const result = await callFunction<
        ListEtsyListingsRequest,
        ListEtsyListingsResponse
      >({
        functionName: 'listEtsyListings',
        data: {},
        idToken: adminUser.idToken,
      });

      const simple = result.data!.listings.find(
        (l) => l.listing.listing_id === 301
      )!;
      const variants = result.data!.listings.find(
        (l) => l.listing.listing_id === 302
      )!;

      expect(simple.variantCount).toBe(1);
      expect(simple.isSimple).toBe(true);
      expect(variants.variantCount).toBe(3);
      expect(variants.isSimple).toBe(false);
    });
  });
});
