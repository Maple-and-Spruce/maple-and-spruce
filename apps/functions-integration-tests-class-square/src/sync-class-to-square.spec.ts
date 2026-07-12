/**
 * Integration tests for the `syncClassToSquare` Firestore trigger.
 *
 * Exercises the REAL chain end-to-end against the Firebase emulator:
 *
 *   Firestore write (classes/{id})  →  syncClassToSquare fires in the
 *   maple-square functions emulator  →  its `new Square(...)` client hits the
 *   Square mock server (redirected via SQUARE_BASE_URL)  →  the returned
 *   catalog IDs are written back onto the class doc.
 *
 * We assert the write-back (the backbone — it can only happen if the whole
 * chain worked) AND the actual payloads the trigger sent to Square, read back
 * from the mock via its `/_mock/requests` introspection route.
 *
 * NOTE: requires the maple-square codebase to be built and loaded in the
 * emulator, and the Square mock server running on 9997(+offset). The harness
 * (`tools/run-integration-tests.sh class-square`) sets all of this up.
 */
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  EMULATOR_CONFIG,
  PUBLISHED_CLASS,
} from '@maple/firebase/integration-test-utils';

const squareMockUrl = EMULATOR_CONFIG.squareMockServerUrl;

interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

/** Wait for the async Firestore trigger + Square round-trip to complete. */
function waitForTrigger(ms = 5000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetSquareMock(): Promise<void> {
  const res = await fetch(`${squareMockUrl}/_mock/reset`, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Square mock reset failed: ${res.status}`);
  }
}

async function getSquareRequests(pathPrefix?: string): Promise<RecordedRequest[]> {
  const res = await fetch(`${squareMockUrl}/_mock/requests`);
  if (!res.ok) {
    throw new Error(`Square mock requests failed: ${res.status}`);
  }
  const body = (await res.json()) as { requests: RecordedRequest[] };
  const requests = body.requests ?? [];
  return pathPrefix
    ? requests.filter((r) => r.path.startsWith(pathPrefix))
    : requests;
}

/**
 * Recursively collect every object of a given catalog `type` (ITEM,
 * ITEM_VARIATION, MODIFIER_LIST) found anywhere in a batch-upsert body.
 * Tolerant of snake_case vs camelCase — we only key off the `type` field.
 */
function collectByType(node: unknown, type: string, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const el of node) collectByType(el, type, out);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj['type'] === type) out.push(obj);
    for (const value of Object.values(obj)) collectByType(value, type, out);
  }
}

/** Pull `item_data` / `itemData` off a catalog object regardless of casing. */
function dataFor(obj: Record<string, unknown>, snake: string, camel: string): Record<string, unknown> | undefined {
  return (obj[snake] ?? obj[camel]) as Record<string, unknown> | undefined;
}

const PUBLISHED = {
  ...PUBLISHED_CLASS,
  name: 'Integration Pottery 101',
  priceCents: 5500,
  capacity: 8,
  status: 'published',
};

describe('syncClassToSquare (emulator + Square mock)', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await resetSquareMock();
  });

  it('creates a Square catalog item, writes the IDs back, and seeds inventory on publish', async () => {
    const id = 'class-square-test-1';
    await setFirestoreDoc('classes', id, { ...PUBLISHED, id });

    await waitForTrigger(5000);

    // --- Backbone: IDs written back onto the class doc ---
    const doc = await getFirestoreDoc('classes', id);
    expect(doc).toBeDefined();
    expect(doc!['squareCatalogItemId']).toBeDefined();
    expect(doc!['squareVariationId']).toBeDefined();
    expect(doc!['squareModifierListId']).toBeDefined();

    // --- Actual payloads sent to Square ---
    const upserts = await getSquareRequests('/v2/catalog/batch-upsert');
    expect(upserts.length).toBeGreaterThanOrEqual(1);

    const items: Record<string, unknown>[] = [];
    const modLists: Record<string, unknown>[] = [];
    for (const req of upserts) {
      collectByType(req.body, 'ITEM', items);
      collectByType(req.body, 'MODIFIER_LIST', modLists);
    }

    // Log the actual recorded shape once for debugging shape assumptions.
    if (process.env['DEBUG_SQUARE_MOCK']) {
      console.log('ITEMS', JSON.stringify(items, null, 2));
      console.log('MODLISTS', JSON.stringify(modLists, null, 2));
    }

    // An ITEM with the class name was upserted.
    const namedItem = items.find((item) => {
      const d = dataFor(item, 'item_data', 'itemData');
      return d?.['name'] === PUBLISHED.name;
    });
    expect(namedItem).toBeDefined();

    // The required single-option modifier list with the exact name exists.
    const requiredModList = modLists.find((ml) => {
      const d = dataFor(ml, 'modifier_list_data', 'modifierListData');
      return d?.['name'] === 'Added customer email (required)?';
    });
    expect(requiredModList).toBeDefined();

    // Inventory seeded to capacity (8) - registrations (0) = 8.
    const invReqs = await getSquareRequests('/v2/inventory/changes/batch-create');
    expect(invReqs.length).toBeGreaterThanOrEqual(1);

    const quantities: unknown[] = [];
    for (const req of invReqs) {
      const body = req.body as Record<string, unknown>;
      const changes = (body['changes'] as Record<string, unknown>[]) ?? [];
      for (const change of changes) {
        const pc = dataFor(change, 'physical_count', 'physicalCount');
        if (pc && pc['quantity'] != null) quantities.push(pc['quantity']);
      }
    }
    // Square serializes quantity as a string; tolerate string or number.
    expect(quantities.map(String)).toContain('8');
  });

  it('deletes the Square catalog item and clears the IDs on unpublish', async () => {
    const id = 'class-square-test-2';
    await setFirestoreDoc('classes', id, { ...PUBLISHED, id });
    await waitForTrigger(5000);

    const published = await getFirestoreDoc('classes', id);
    const itemId = published!['squareCatalogItemId'] as string | undefined;
    expect(itemId).toBeDefined();

    // Reset the recorded requests so we only see the unpublish traffic.
    await fetch(`${squareMockUrl}/_mock/reset`, { method: 'POST' });

    // Flip to draft. `setFirestoreDoc` PATCHes without an updateMask, which
    // replaces the whole doc — so carry the written-back Square IDs forward
    // to mirror a real partial update (updateClass preserves them). Without
    // them the trigger's `after` would have no squareCatalogItemId and would
    // never issue the delete.
    await setFirestoreDoc('classes', id, {
      ...PUBLISHED,
      id,
      status: 'draft',
      squareCatalogItemId: itemId,
      squareVariationId: published!['squareVariationId'],
      squareModifierListId: published!['squareModifierListId'],
      squareCatalogVersion: published!['squareCatalogVersion'],
    });
    await waitForTrigger(5000);

    const deletes = await getSquareRequests('/v2/catalog/object/');
    const matched = deletes.find(
      (r) => r.method === 'DELETE' && r.path.includes(itemId as string)
    );
    expect(matched).toBeDefined();

    const after = await getFirestoreDoc('classes', id);
    expect(after!['squareCatalogItemId']).toBeFalsy();
  });
});
