/**
 * Webflow API mock routes.
 *
 * Implements the Webflow CMS API endpoints used by our sync functions:
 * - GET /collections/:collectionId/items (list items)
 * - POST /collections/:collectionId/items (create item)
 * - PATCH /collections/:collectionId/items/:itemId (update item)
 * - DELETE /collections/:collectionId/items/:itemId (delete item)
 * - PUT /collections/:collectionId/items/publish (publish items)
 */
import { MockServer } from '../mock-server.js';

let itemCounter = 0;

/** In-memory CMS items store, keyed by collection → itemId */
const collections = new Map<string, Map<string, Record<string, unknown>>>();

function getCollection(
  collectionId: string
): Map<string, Record<string, unknown>> {
  if (!collections.has(collectionId)) {
    collections.set(collectionId, new Map());
  }
  return collections.get(collectionId)!;
}

export function registerWebflowRoutes(server: MockServer): void {
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

  // Delete collection item
  server.delete('/collections/:collectionId/items/:itemId', (req) => {
    const collectionId = req.params['collectionId'];
    const itemId = req.params['itemId'];
    const collection = getCollection(collectionId);
    collection.delete(itemId);

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
}
