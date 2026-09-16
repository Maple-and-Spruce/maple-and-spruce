/**
 * Webflow API mock routes.
 *
 * Implements the Webflow CMS API endpoints used by our sync functions:
 * - GET /collections/:collectionId/items (list items)
 * - GET /collections/:collectionId/items/:itemId (get one item)
 * - POST /collections/:collectionId/items (create item)
 * - PATCH /collections/:collectionId/items/:itemId (update item)
 * - DELETE /collections/:collectionId/items/:itemId (staged delete)
 * - DELETE /collections/:collectionId/items/:itemId/live (live delete; auto-publishes)
 * - PUT /collections/:collectionId/items/publish (publish items)
 */
import { WebflowMockServer } from '../webflow-mock-server';

let itemCounter = 0;

/** In-memory CMS items store, keyed by collection -> itemId */
const collections = new Map<string, Map<string, Record<string, unknown>>>();

/**
 * Tracks which delete endpoint was used for each item ID.
 * Integration tests can inspect this to verify prod vs. dev delete behavior.
 */
const deleteLog: Array<{ itemId: string; live: boolean }> = [];

/**
 * When set, the next `remaining` lookup requests (list + get-by-id) answer
 * with `status` instead of succeeding.
 *
 * A mock that can only succeed or 404 cannot express the failure that matters
 * most here: real Webflow rate-limits at 429 and 5xxs under load, and a sync
 * that reads either as "this class has no CMS item" will create a duplicate.
 * Without this hook that bug passes as green, which is exactly what happened.
 * Mirrors `declineNextPayment` in the Square mock.
 */
let failNextLookups: { status: number; remaining: number } | null = null;

function takeLookupFailure(): number | null {
  if (!failNextLookups) return null;
  const { status } = failNextLookups;
  failNextLookups.remaining -= 1;
  if (failNextLookups.remaining <= 0) failNextLookups = null;
  return status;
}

function getCollection(
  collectionId: string
): Map<string, Record<string, unknown>> {
  if (!collections.has(collectionId)) {
    collections.set(collectionId, new Map());
  }
  return collections.get(collectionId)!;
}

export function registerWebflowRoutes(server: WebflowMockServer): void {
  // List collection items
  server.get('/collections/:collectionId/items', (req) => {
    const failure = takeLookupFailure();
    if (failure) {
      return {
        status: failure,
        body: { code: failure, msg: 'Mock transient lookup failure' },
      };
    }

    const collection = getCollection(req.params['collectionId']);
    const items = Array.from(collection.values());

    return {
      status: 200,
      body: {
        items,
        pagination: {
          limit: 100,
          offset: 0,
          total: items.length,
        },
      },
    };
  });

  // Get a single collection item.
  //
  // Every sync service calls this first when it already knows an item ID
  // (`resolveExistingItemId`), and only falls back to a full paginated scan on
  // a 404. Without this route the mock 404s every time, so that fast path was
  // never actually exercised — a regression in it would have looked green.
  // Registered before the list route is unnecessary (different arity), but the
  // handler must 404 on unknown IDs to keep the fallback behaviour testable.
  server.get('/collections/:collectionId/items/:itemId', (req) => {
    const failure = takeLookupFailure();
    if (failure) {
      return {
        status: failure,
        body: { code: failure, msg: 'Mock transient lookup failure' },
      };
    }

    const collection = getCollection(req.params['collectionId']);
    const item = collection.get(req.params['itemId']);

    if (!item) {
      return {
        status: 404,
        body: { code: 404, msg: `Item ${req.params['itemId']} not found` },
      };
    }

    return { status: 200, body: item };
  });

  // Create collection item
  server.post('/collections/:collectionId/items', (req) => {
    const collectionId = req.params['collectionId'];
    const body = req.body as Record<string, unknown>;
    itemCounter++;
    const itemId = `mock-webflow-item-${itemCounter}`;

    const item = {
      id: itemId,
      cmsLocaleId: 'en-US',
      lastPublished: null,
      lastUpdated: new Date().toISOString(),
      createdOn: new Date().toISOString(),
      isArchived: false,
      isDraft: body['isDraft'] ?? true,
      fieldData: body['fieldData'] ?? {},
    };

    const collection = getCollection(collectionId);
    collection.set(itemId, item);

    return { status: 200, body: item };
  });

  // Update collection item
  server.patch('/collections/:collectionId/items/:itemId', (req) => {
    const collectionId = req.params['collectionId'];
    const itemId = req.params['itemId'];
    const body = req.body as Record<string, unknown>;
    const collection = getCollection(collectionId);

    const existing = collection.get(itemId);
    if (!existing) {
      return {
        status: 404,
        body: {
          code: 404,
          msg: `Item ${itemId} not found`,
        },
      };
    }

    const updated: Record<string, unknown> = {
      ...existing,
      lastUpdated: new Date().toISOString(),
      fieldData: {
        ...(existing['fieldData'] as Record<string, unknown>),
        ...(body['fieldData'] as Record<string, unknown>),
      },
    };

    if (body['isDraft'] !== undefined) {
      updated['isDraft'] = body['isDraft'];
    }
    if (body['isArchived'] !== undefined) {
      updated['isArchived'] = body['isArchived'];
    }

    collection.set(itemId, updated);

    return { status: 200, body: updated };
  });

  // Delete collection item (live — auto-publishes the removal)
  // Must be registered before the staged route so the `/live` suffix matches first.
  server.delete('/collections/:collectionId/items/:itemId/live', (req) => {
    const collectionId = req.params['collectionId'];
    const itemId = req.params['itemId'];
    const collection = getCollection(collectionId);
    collection.delete(itemId);
    deleteLog.push({ itemId, live: true });

    return { status: 204, body: {} };
  });

  // Delete collection item (staged — requires a separate publish to go live)
  server.delete('/collections/:collectionId/items/:itemId', (req) => {
    const collectionId = req.params['collectionId'];
    const itemId = req.params['itemId'];
    const collection = getCollection(collectionId);
    collection.delete(itemId);
    deleteLog.push({ itemId, live: false });

    return { status: 204, body: {} };
  });

  // Publish collection items
  server.put('/collections/:collectionId/items/publish', (req) => {
    const collectionId = req.params['collectionId'];
    const body = req.body as Record<string, unknown>;
    const itemIds = (body['itemIds'] as string[]) ?? [];
    const collection = getCollection(collectionId);

    for (const itemId of itemIds) {
      const item = collection.get(itemId);
      if (item) {
        item['lastPublished'] = new Date().toISOString();
        item['isDraft'] = false;
      }
    }

    return {
      status: 200,
      body: { publishedItemIds: itemIds },
    };
  });
}

/**
 * Reset Webflow mock state between tests.
 */
export function resetWebflowState(): void {
  itemCounter = 0;
  collections.clear();
  deleteLog.length = 0;
  failNextLookups = null;
}

/**
 * Arm the next `count` lookup requests to fail with `status`.
 *
 * For in-process suites. Emulator-backed suites run the mock in a separate
 * `tsx` process, where this module's state is unreachable — those arm it over
 * HTTP with `POST /_mock/fail-next-lookups`.
 */
export function failNextWebflowLookups(status = 500, count = 1): void {
  failNextLookups = { status, remaining: count };
}

/**
 * Disarm any primed failures, leaving the stored items alone.
 *
 * The Webflow SDK retries 5xx internally, so a test has to arm SEVERAL
 * failures for one to survive the retries and reach the code under test. That
 * leaves unused failures primed, which would then answer the test's own
 * verification requests with a 500 body instead of the collection. Call this
 * between "make it fail" and "check what happened".
 */
export function clearWebflowLookupFailures(): void {
  failNextLookups = null;
}

/**
 * Get the delete-endpoint log.
 * Each entry records whether the live (/live) or staged endpoint was hit.
 */
export function getWebflowDeleteLog(): ReadonlyArray<{
  itemId: string;
  live: boolean;
}> {
  return deleteLog;
}
