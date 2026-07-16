/**
 * Tier-1 real-Square-sandbox e2e: product inventory webhook → cached quantity.
 *
 * Proves the inbound `inventory.count.updated` path against a REAL sandbox
 * catalog variation id (closing the mock-drift gap the mock-backed suite can't):
 *
 *   1. Create a REAL sandbox retail ITEM + variation (trackInventory: true).
 *   2. Seed a `products` Firestore doc whose variant `squareVariationId`
 *      matches that real variation, with an initial cached quantity.
 *   3. Self-sign + POST an `inventory.count.updated` for that variation id with
 *      a new quantity → `squareWebhook` runs `handleInventoryUpdate` inline.
 *   4. Assert the product's cached variant quantity is updated to the new value.
 *
 * `handleInventoryUpdate` reads the quantity straight from the event payload
 * (it does NOT call Square), so this validates the variation-id matching +
 * Firestore write path against a REAL catalog variation id rather than a
 * fabricated one.
 *
 * REQUIRES the same emulator + real-sandbox setup as pos-class-sale.spec.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SquareClient } from 'square';
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import {
  sandboxSquare,
  createSandboxProduct,
  deleteCatalogItem,
  inventoryUpdatedEvent,
  postWebhook,
  pollFor,
  uniqueId,
} from './support/square-sandbox';

let client: SquareClient;
let locationId: string;
const createdItemIds: string[] = [];

const INITIAL_QUANTITY = 10;
const UPDATED_QUANTITY = 7;
const INVENTORY_TIMEOUT_MS = 30000;

describe('POS product inventory webhook against REAL Square sandbox', () => {
  beforeAll(async () => {
    const square = sandboxSquare();
    client = square.getClient();
    locationId = square.locationId;
    await clearFirestoreEmulator();
  });

  afterAll(async () => {
    for (const itemId of createdItemIds) {
      await deleteCatalogItem(client, itemId);
    }
    await clearFirestoreEmulator();
  });

  it('decrements the product cached quantity on inventory.count.updated', async () => {
    // 1. Real sandbox item + variation.
    const { itemId, variationId } = await createSandboxProduct(client, {
      name: uniqueId('POS Sandbox Mug'),
      priceCents: 2500,
    });
    createdItemIds.push(itemId);
    expect(variationId).toBeTruthy();

    // 2. Seed a products doc matching the Product shape docToProduct expects
    //    (variants[] with squareVariationId, listing-level squareCache, and a
    //    createdAt so ProductRepository.findAll's orderBy('createdAt') returns
    //    it). The variant's squareVariationId === the REAL variation id.
    const productId = uniqueId('pos-product');
    const now = new Date();
    await setFirestoreDoc('products', productId, {
      artistId: 'sandbox-artist',
      categoryId: 'sandbox-category',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      variants: [
        {
          id: 'variant-1',
          label: 'Regular',
          sku: uniqueId('sku'),
          priceCents: 2500,
          quantity: INITIAL_QUANTITY,
          squareVariationId: variationId,
        },
      ],
      squareItemId: itemId,
      squareVariationId: variationId,
      squareCatalogVersion: 1,
      squareLocationId: locationId,
      squareCache: {
        name: 'POS Sandbox Mug',
        description: 'Real sandbox retail item',
        syncedAt: now,
        priceCents: 2500,
        quantity: INITIAL_QUANTITY,
        sku: 'sandbox-sku',
      },
    });

    // 3. Self-sign + POST inventory.count.updated for the real variation id.
    const res = await postWebhook(
      inventoryUpdatedEvent(variationId, UPDATED_QUANTITY, locationId)
    );
    expect(res.status).toBe(200);
    expect((res.body as { action?: string }).action).toBe('updated');

    // 4. Assert the cached variant quantity flipped to the new value.
    //    `handleInventoryUpdate` → ProductRepository.updateCachedQuantity writes
    //    the variants[] array; squareCache.quantity is re-derived from
    //    variants[0] at READ time (docToProduct), so the stored variant
    //    quantity is the source of truth we assert on here.
    const variantQuantity = await pollFor(
      async () => {
        const doc = await getFirestoreDoc('products', productId);
        const variants = doc?.['variants'] as
          | Array<Record<string, unknown>>
          | undefined;
        const qty = variants?.[0]?.['quantity'] as number | undefined;
        return qty === UPDATED_QUANTITY ? qty : undefined;
      },
      { timeoutMs: INVENTORY_TIMEOUT_MS }
    );

    expect(variantQuantity).toBe(UPDATED_QUANTITY);
  });
});
