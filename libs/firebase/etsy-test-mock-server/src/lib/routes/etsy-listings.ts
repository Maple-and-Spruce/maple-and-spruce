/**
 * Etsy v3 listing routes.
 *
 * Backs both single-listing and shop-listings endpoints with the shared
 * in-memory fixture store.
 */
import type { EtsyMockServer } from '../etsy-mock-server';
import {
  clearListings,
  getListingById,
  getListings,
  seedToEtsyListing,
  setListings,
  type MockListingSeed,
} from '../listing-fixtures';
import { resetOAuthState } from './etsy-oauth';

/**
 * Response-shape config for `GET /users/:userId/shops`.
 *
 * Defaults to the paginated `{ results: [...] }` shape, which is what
 * the original auth-callback test suite was written against. Tests that
 * need to exercise the top-level or failure paths can override this via
 * POST /_mock/shops-config.
 */
type ShopsResponseShape = 'paginated' | 'top-level' | 'empty-results';
interface ShopsConfig {
  shape: ShopsResponseShape;
  status: number;
  shopId: number;
}
let shopsConfig: ShopsConfig = {
  shape: 'paginated',
  status: 200,
  shopId: 22222,
};

export function resetShopsConfig(): void {
  shopsConfig = { shape: 'paginated', status: 200, shopId: 22222 };
}

export function registerEtsyListingRoutes(server: EtsyMockServer): void {
  // GET /v3/application/listings/:listingId
  server.get('/v3/application/listings/:listingId', (req) => {
    const id = Number(req.params['listingId']);
    const seed = getListingById(id);
    if (!seed) {
      return {
        status: 404,
        body: { error: 'not_found', error_description: `Listing ${id}` },
      };
    }
    return { status: 200, body: seedToEtsyListing(seed) };
  });

  // GET /v3/application/shops/:shopId/listings
  server.get('/v3/application/shops/:shopId/listings', (req) => {
    const state = req.query['state'];
    const limit = Number(req.query['limit'] ?? 100);
    const offset = Number(req.query['offset'] ?? 0);

    const all = getListings();
    const filtered = state ? all.filter((l) => l.state === state) : all;
    const page = filtered.slice(offset, offset + limit);

    return {
      status: 200,
      body: {
        count: filtered.length,
        results: page.map(seedToEtsyListing),
      },
    };
  });

  // GET /v3/application/users/:userId/shops — used by etsy-auth-callback
  // and refreshEtsyShopId to resolve the shop ID. Shape is configurable
  // via POST /_mock/shops-config so tests can exercise the paginated,
  // top-level, and failure cases without restarting the server.
  server.get('/v3/application/users/:userId/shops', (req) => {
    if (shopsConfig.status !== 200) {
      return {
        status: shopsConfig.status,
        body: { error: 'mock_error', status: shopsConfig.status },
      };
    }
    const userId = Number(req.params['userId']);
    if (shopsConfig.shape === 'top-level') {
      return {
        status: 200,
        body: {
          shop_id: shopsConfig.shopId,
          user_id: userId,
          shop_name: 'MockShop',
        },
      };
    }
    if (shopsConfig.shape === 'empty-results') {
      return {
        status: 200,
        body: { count: 0, results: [] },
      };
    }
    return {
      status: 200,
      body: {
        count: 1,
        results: [
          {
            shop_id: shopsConfig.shopId,
            user_id: userId,
            shop_name: 'MockShop',
          },
        ],
      },
    };
  });

  // Mock image serving. Etsy CDN images are hosted on i.etsystatic.com in
  // production; fixtures point at this path so importEtsyListings' image
  // copy step can fetch() through the mock.
  server.get('/mock-images/:name', () => {
    // Tiny opaque JPEG header bytes — enough to satisfy fetch().arrayBuffer()
    // without any real decoding.
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    return {
      status: 200,
      body: null,
      rawBody: fakeJpeg,
      contentType: 'image/jpeg',
    };
  });

  // ---------------------------------------------------------------------------
  // Test-control endpoints under /_mock/*
  //
  // The mock server runs in its own process separate from the test runner,
  // so tests need an HTTP surface to seed fixtures and reset state. These
  // routes are prefixed with _mock/ to keep them obviously non-Etsy.
  // ---------------------------------------------------------------------------
  server.post('/_mock/listings', (req) => {
    const body = req.body as { seeds?: MockListingSeed[] } | undefined;
    if (!body || !Array.isArray(body.seeds)) {
      return {
        status: 400,
        body: { error: 'Expected { seeds: MockListingSeed[] }' },
      };
    }
    setListings(body.seeds);
    return { status: 200, body: { ok: true, count: body.seeds.length } };
  });

  server.post('/_mock/shops-config', (req) => {
    const body = req.body as Partial<ShopsConfig> | undefined;
    if (!body) {
      return { status: 400, body: { error: 'Expected ShopsConfig body' } };
    }
    shopsConfig = {
      shape: body.shape ?? shopsConfig.shape,
      status: body.status ?? shopsConfig.status,
      shopId: body.shopId ?? shopsConfig.shopId,
    };
    return { status: 200, body: { ok: true, config: shopsConfig } };
  });

  server.post('/_mock/reset', () => {
    clearListings();
    resetOAuthState();
    resetShopsConfig();
    return { status: 200, body: { ok: true } };
  });
}
