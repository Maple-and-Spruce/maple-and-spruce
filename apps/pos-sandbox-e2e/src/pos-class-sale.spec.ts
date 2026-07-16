/**
 * Tier-1 real-Square-sandbox e2e: POS class sale → source:'pos' registration.
 *
 * Unlike the mock-backed `pos-sale-webhook.spec.ts` (which seeds a fabricated
 * payment→order→customer graph into the Square mock), this suite proves the
 * inbound POS path against ACTUAL Square sandbox responses — closing the
 * mock-drift gap:
 *
 *   1. Seed a published class with NO Square ids → the `syncClassToSquare`
 *      Firestore trigger (running in the emulator, SDK pointed at real sandbox)
 *      creates a REAL sandbox catalog item + variation and writes the variation
 *      id back onto the class doc.
 *   2. Create a REAL sandbox order (that variation as a catalog line item, an
 *      ORDER-scope tax, no referenceId) + payment (sandbox nonce, autocomplete).
 *   3. Self-sign + POST a `payment.updated` (COMPLETED) to the emulator
 *      `squareWebhook`, which enqueues `posSaleRequests/{paymentId}`.
 *   4. `processPosSale` fires, fetches the REAL payment/order/customer from
 *      Square, and creates a `source:'pos'` registration.
 *
 * We assert via Firestore (a `source:'pos'` registration can only exist if the
 * whole real chain ran) and check the money fields against the REAL order —
 * relationships (subtotal + tax === paid, all > 0), not hardcoded cents, since
 * the sandbox is the source of truth.
 *
 * REQUIRES: all four function codebases built + loaded in the emulator with the
 * maple-square `.env` OMITTING SQUARE_BASE_URL (SDK → real sandbox) and a real
 * SQUARE_ACCESS_TOKEN; the test process needs SQUARE_ACCESS_TOKEN /
 * SQUARE_LOCATION_ID / SQUARE_ENV / SALES_TAX_RATE. See build-check.yml ::
 * pos-sandbox-e2e. Cannot run without the sandbox token.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SquareClient } from 'square';
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  listFirestoreDocs,
  PUBLISHED_CLASS,
} from '@maple/firebase/integration-test-utils';
import {
  sandboxSquare,
  createPosOrderAndPayment,
  deleteCatalogItem,
  paymentUpdatedEvent,
  postWebhook,
  pollFor,
  uniqueId,
} from './support/square-sandbox';

const SALES_TAX_RATE = process.env['SALES_TAX_RATE'] ?? '6.0';

let client: SquareClient;
let locationId: string;
/** Square catalog ITEM ids created during the run (class + any product). */
const createdItemIds: string[] = [];

/** How long to wait for syncClassToSquare to write the variation id back. */
const CLASS_SYNC_TIMEOUT_MS = 45000;
/** How long to wait for the two async trigger hops + Square round-trips. */
const REGISTRATION_TIMEOUT_MS = 60000;

describe('POS class sale against REAL Square sandbox', () => {
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

  it('creates a source:pos registration from real sandbox order/payment data', async () => {
    const classId = uniqueId('pos-class');
    const className = uniqueId('POS Sandbox Pottery');
    const priceCents = 4500;
    const capacity = 8;

    // 1. Seed a published class WITHOUT Square ids → syncClassToSquare creates
    //    the real sandbox catalog item and writes squareVariationId back.
    await setFirestoreDoc('classes', classId, {
      ...PUBLISHED_CLASS,
      id: classId,
      name: className,
      priceCents,
      capacity,
      status: 'published',
    });

    // 2. Poll until the trigger writes the real sandbox variation id back.
    const { variationId, itemId } = await pollFor(
      async () => {
        const doc = await getFirestoreDoc('classes', classId);
        const variation = doc?.['squareVariationId'] as string | undefined;
        const item = doc?.['squareCatalogItemId'] as string | undefined;
        if (variation && item) {
          return { variationId: variation, itemId: item };
        }
        return undefined;
      },
      { timeoutMs: CLASS_SYNC_TIMEOUT_MS }
    );
    // Track for teardown as soon as we know the real item id.
    createdItemIds.push(itemId);

    expect(variationId).toBeTruthy();

    // 3. Create a REAL sandbox order (catalog line item, ORDER tax, no
    //    referenceId) + payment.
    const { orderId, paymentId, totalCents } = await createPosOrderAndPayment(
      client,
      {
        locationId,
        catalogObjectId: variationId,
        quantity: 1,
        taxPercentage: SALES_TAX_RATE,
      }
    );
    expect(orderId).toBeTruthy();
    expect(paymentId).toBeTruthy();
    expect(totalCents).toBeGreaterThan(0);

    // 4. Self-sign + POST payment.updated (COMPLETED) → squareWebhook enqueues.
    const res = await postWebhook(paymentUpdatedEvent(paymentId, orderId));
    expect(res.status).toBe(200);
    expect((res.body as { action?: string }).action).toBe('enqueued');

    // 5. Poll for the source:'pos' registration created by processPosSale.
    const reg = await pollFor(
      async () => {
        const regs = await listFirestoreDocs('registrations');
        return regs.find(
          (r) =>
            r.data['source'] === 'pos' &&
            r.data['squareOrderId'] === orderId
        )?.data;
      },
      { timeoutMs: REGISTRATION_TIMEOUT_MS }
    );

    // Backbone assertions: the registration only exists if the full real chain
    // ran (webhook → posSaleRequests → processPosSale → real Square fetch).
    expect(reg['classId']).toBe(classId);
    expect(reg['squareOrderId']).toBe(orderId);
    expect(reg['squarePaymentId']).toBe(paymentId);
    expect(reg['status']).toBe('confirmed');

    // Money fields come straight from the REAL order line item, so assert
    // relationships rather than hardcoded cents.
    const subtotalCents = reg['subtotalCents'] as number;
    const taxAmountCents = reg['taxAmountCents'] as number;
    const pricePaidCents = reg['pricePaidCents'] as number;
    expect(subtotalCents).toBeGreaterThan(0);
    expect(taxAmountCents).toBeGreaterThan(0);
    expect(pricePaidCents).toBeGreaterThan(0);
    // Pre-tax subtotal is the catalog variation's price (quantity 1).
    expect(subtotalCents).toBe(priceCents);
    // Paid == subtotal + tax, and matches the real order total we paid.
    expect(pricePaidCents).toBe(subtotalCents + taxAmountCents);
    expect(pricePaidCents).toBe(totalCents);
  });
});
