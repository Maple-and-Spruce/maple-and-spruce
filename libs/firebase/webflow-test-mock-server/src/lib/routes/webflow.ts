/**
 * Webflow API mock routes.
 *
 * Implements the Webflow CMS API endpoints used by our sync functions:
 * - GET /collections/:collectionId/items (list items)
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
