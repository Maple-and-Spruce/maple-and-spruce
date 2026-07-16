/**
 * Tier-2 POST-MERGE real-DELIVERY POS smoke against the DEPLOYED dev backend.
 *
 * The Tier-1 specs (pos-class-sale / pos-product-sale) run in the Firebase
 * EMULATOR and self-sign + POST webhooks straight to the emulator
 * `squareWebhook`. That proves the reaction logic against real Square DATA, but
 * it never exercises the TRUE inbound edge: Square's own webhook DELIVERY (real
 * signature, real network hop, real subscription config). This suite closes
 * that last gap.
 *
 * Runs ONLY when `E2E_TARGET === 'dev'` (the post-merge `e2e_dev` job, after the
 * dev functions are deployed). It:
 *
 *   1. Creates real sandbox sales / inventory changes with the SAME
 *      `square-sandbox.ts` helpers the Tier-1 suite uses.
 *   2. Lets **Square actually deliver** `payment.updated` /
 *      `inventory.count.updated` to the DEPLOYED dev `squareWebhook` — this test
 *      does NOT self-sign or POST anything.
 *   3. Asserts the reaction landed in DEPLOYED dev Firestore, read back through
 *      firebase-admin (Application Default Credentials, exactly like
 *      registration-e2e's `seed-dev.ts`).
 *
 * Because real webhook delivery is inherently async (Square enqueues + retries
 * on its side, then two Firestore-trigger hops on ours), timeouts are generous
 * and failure messages point at the most likely cause: a missing / mis-pointed
 * dev webhook SUBSCRIPTION, not a code regression.
 *
 * Auth / env the CI step provides (see firebase-functions-merge.yml :: e2e_dev):
 *   E2E_TARGET=dev            gates this suite on
 *   GOOGLE_CLOUD_PROJECT      maple-and-spruce-dev (firebase-admin target)
 *   GOOGLE_APPLICATION_CREDENTIALS  written by google-github-actions/auth
 *   SQUARE_ACCESS_TOKEN       real sandbox token (from SQUARE_SANDBOX_ACCESS_TOKEN)
 *   SQUARE_ENV=LOCAL          → SDK sandbox environment
 *   SQUARE_LOCATION_ID        sandbox location id (public, from .env.dev)
 *   SALES_TAX_RATE            sales-tax percent (public, from .env.dev)
 * SQUARE_BASE_URL must NOT be set — the sandbox client honours it and would be
 * redirected off connect.squareupsandbox.com.
 *
 * CANNOT be validated locally / in-emulator: it depends on the DEPLOYED dev
 * functions and real Square webhook delivery. Verified structurally only until
 * it runs post-merge.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import type { SquareClient } from 'square';
import type { Square } from '@maple/firebase/square';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  sandboxSquare,
  createPosOrderAndPayment,
  createSandboxProduct,
  deleteCatalogItem,
  pollFor,
} from './support/square-sandbox';

const IS_DEV = process.env['E2E_TARGET'] === 'dev';
const DEV_PROJECT_ID =
  process.env['GOOGLE_CLOUD_PROJECT'] ?? 'maple-and-spruce-dev';
const SALES_TAX_RATE = process.env['SALES_TAX_RATE'] ?? '6.0';

/**
 * How long to wait for the DEPLOYED `syncClassToSquare` trigger to write the
 * real sandbox variation id back onto the class doc.
 */
const CLASS_SYNC_TIMEOUT_MS = 60_000;
/**
 * How long to wait for Square to actually DELIVER `payment.updated` to the
 * deployed webhook and for the two async trigger hops (squareWebhook →
 * posSaleRequests → processPosSale) to produce the registration. Real delivery
 * (Square-side queue + retry) is the slow part, so this is generous.
 */
const REGISTRATION_DELIVERY_TIMEOUT_MS = 120_000;
/**
 * How long to wait for Square to DELIVER `inventory.count.updated` to the
 * deployed webhook and for `handleInventoryUpdate` to write the new quantity.
 */
const INVENTORY_DELIVERY_TIMEOUT_MS = 120_000;
/** Poll cadence for the delivery waits — real delivery isn't sub-second. */
const DELIVERY_POLL_INTERVAL_MS = 5_000;

// --- firebase-admin against DEPLOYED dev Firestore -------------------------
// Init + withRetry copied from registration-e2e/src/seed-dev.ts: credentials
// come from Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS in
// CI via google-github-actions/auth). Being explicit about projectId avoids the
// "could not load default credentials" error when the Workload Identity flow
// carries a service-account file without an embedded project_id.
function getAdminDb(): Firestore {
  if (getApps().length === 0) {
    initializeApp({ projectId: DEV_PROJECT_ID });
  }
  return getFirestore();
}

/**
 * Wrap a `pollFor` call so a genuine TIMEOUT is reported with an actionable
 * webhook-subscription hint, while any other error (e.g. a hard permission
 * failure that `withRetry` gave up on) is surfaced unchanged rather than
 * masked behind a misleading "delivery" message.
 */
async function withDeliveryHint<T>(
  run: () => Promise<T>,
  hint: string
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/pollFor timed out/.test(msg)) {
      throw new Error(hint);
    }
    throw err;
  }
}

/**
 * Retry a Firestore op on transient STS/connection blips. In CI the Admin SDK
 * gets credentials keylessly: the first call triggers a Workload Identity token
 * exchange against sts.googleapis.com, which intermittently drops with
 * "Premature close" — a connection-layer hiccup, not an auth/quota error.
 * Non-transient errors (e.g. permission denied) throw immediately.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const MAX_ATTEMPTS = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        /Premature close|metadata from plugin|sts\.googleapis\.com|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|UNAVAILABLE|DEADLINE_EXCEEDED|Getting metadata|503|429/i.test(
          msg
        );
      if (!transient || attempt === MAX_ATTEMPTS) break;
      const delayMs = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      console.warn(
        `[pos-dev-smoke] ${label} attempt ${attempt}/${MAX_ATTEMPTS} failed (${msg}); retrying in ${delayMs}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

// --- run-scoped cleanup tracking -------------------------------------------
let square: Square;
let client: SquareClient;
let locationId: string;
let db: Firestore;

/** Sandbox catalog ITEM ids created this run (class + product) — soft-deleted in teardown. */
const createdItemIds: string[] = [];
/** Dev `classes` doc ids written this run. */
const createdClassIds: string[] = [];
/** Dev `products` doc ids written this run. */
const createdProductIds: string[] = [];
/** Square payment ids this run — used to purge the `posSaleRequests/{paymentId}` queue docs. */
const createdPaymentIds: string[] = [];

describe.runIf(IS_DEV)(
  'POS real-delivery smoke against DEPLOYED dev (Tier 2)',
  () => {
    beforeAll(() => {
      square = sandboxSquare();
      client = square.getClient();
      locationId = square.locationId;
      db = getAdminDb();
    });

    afterAll(async () => {
      // Best-effort teardown — mirror teardownDev: swallow errors so a green run
      // never fails on cleanup, but scrub everything this run created so dev
      // Firestore / the shared sandbox don't accumulate.
      for (const classId of createdClassIds) {
        try {
          const regs = await withRetry('teardown:queryRegistrations', () =>
            db
              .collection('registrations')
              .where('classId', '==', classId)
              .get()
          );
          await Promise.all(regs.docs.map((d) => d.ref.delete().catch(() => undefined)));
          await db.collection('classes').doc(classId).delete().catch(() => undefined);
        } catch {
          /* best-effort */
        }
      }
      for (const paymentId of createdPaymentIds) {
        await db
          .collection('posSaleRequests')
          .doc(paymentId)
          .delete()
          .catch(() => undefined);
      }
      for (const productId of createdProductIds) {
        await db.collection('products').doc(productId).delete().catch(() => undefined);
      }
      for (const itemId of createdItemIds) {
        await deleteCatalogItem(client, itemId);
      }
    });

    it(
      'delivers payment.updated → source:pos registration in dev Firestore',
      async () => {
        const classId = randomUUID();
        const className = `POS Dev Smoke Class ${randomUUID()}`;
        const priceCents = 4500;
        const capacity = 8;

        // 1. Write a published class with NO Square ids → the DEPLOYED
        //    syncClassToSquare trigger creates the real sandbox catalog item and
        //    writes the variation id back onto the doc.
        createdClassIds.push(classId);
        await withRetry('writeClass', () =>
          db
            .collection('classes')
            .doc(classId)
            .set({
              name: className,
              description: 'POS Tier-2 real-delivery smoke.',
              sessions: [{ dateTime: futureIso() }],
              firstSessionAt: futureIso(),
              durationMinutes: 120,
              capacity,
              priceCents,
              skillLevel: 'beginner',
              status: 'published',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
        );

        // 2. Poll the dev class doc until syncClassToSquare writes the real
        //    sandbox variation + catalog item ids back.
        const { variationId, itemId } = await withDeliveryHint(
          () =>
            pollFor(
              async () => {
                const snap = await withRetry('readClass', () =>
                  db.collection('classes').doc(classId).get()
                );
                const data = snap.data();
                const variation = data?.['squareVariationId'] as
                  | string
                  | undefined;
                const item = data?.['squareCatalogItemId'] as
                  | string
                  | undefined;
                return variation && item
                  ? { variationId: variation, itemId: item }
                  : undefined;
              },
              { timeoutMs: CLASS_SYNC_TIMEOUT_MS, intervalMs: 3_000 }
            ),
          `syncClassToSquare did not write squareVariationId back within ` +
            `${CLASS_SYNC_TIMEOUT_MS}ms — is the deployed dev syncClassToSquare ` +
            `trigger healthy and pointed at the real Square sandbox?`
        );
        // Track the sandbox item for teardown as soon as we know its id.
        createdItemIds.push(itemId);
        expect(variationId).toBeTruthy();

        // 3. Create a REAL sandbox order (that variation as a catalog line item,
        //    ORDER-scope tax, no referenceId) + payment. Square emits
        //    payment.created/updated for this on its own.
        const { orderId, paymentId, totalCents } =
          await createPosOrderAndPayment(client, {
            locationId,
            catalogObjectId: variationId,
            quantity: 1,
            taxPercentage: SALES_TAX_RATE,
          });
        createdPaymentIds.push(paymentId);
        expect(orderId).toBeTruthy();
        expect(paymentId).toBeTruthy();
        expect(totalCents).toBeGreaterThan(0);

        // 4. Do NOT post any webhook. Wait for Square to DELIVER
        //    payment.updated (COMPLETED) to the deployed squareWebhook, which
        //    enqueues posSaleRequests/{paymentId}; processPosSale then creates
        //    the source:'pos' registration. Query by squareOrderId (a
        //    single-field, auto-indexed filter — no composite index needed) and
        //    confirm source:'pos' in memory.
        const reg = await withDeliveryHint(
          () =>
            pollFor(
              async () => {
                const snap = await withRetry('queryRegistrationByOrder', () =>
                  db
                    .collection('registrations')
                    .where('squareOrderId', '==', orderId)
                    .get()
                );
                return snap.docs
                  .map((d) => d.data())
                  .find((r) => r['source'] === 'pos');
              },
              {
                timeoutMs: REGISTRATION_DELIVERY_TIMEOUT_MS,
                intervalMs: DELIVERY_POLL_INTERVAL_MS,
              }
            ),
          `No source:'pos' registration for order ${orderId} after ` +
            `${REGISTRATION_DELIVERY_TIMEOUT_MS}ms — check the DEV Square ` +
            `webhook subscription has payment.created/payment.updated enabled ` +
            `and pointed at the deployed squareWebhook (real delivery, not ` +
            `self-signed here).`
        );

        // The registration can only exist if the whole real-delivery chain ran:
        // Square delivery → squareWebhook → posSaleRequests → processPosSale →
        // real Square order fetch → registration.
        expect(reg['classId']).toBe(classId);
        expect(reg['squareOrderId']).toBe(orderId);
        expect(reg['squarePaymentId']).toBe(paymentId);
        expect(reg['status']).toBe('confirmed');
      },
      REGISTRATION_DELIVERY_TIMEOUT_MS + CLASS_SYNC_TIMEOUT_MS + 60_000
    );

    it(
      'delivers inventory.count.updated → product cached quantity in dev Firestore',
      async () => {
        const INITIAL_QUANTITY = 10;
        const UPDATED_QUANTITY = 7;

        // 1. Real sandbox retail item + variation (trackInventory: true).
        const { itemId, variationId } = await createSandboxProduct(client, {
          name: `POS Dev Smoke Mug ${randomUUID()}`,
          priceCents: 2500,
        });
        createdItemIds.push(itemId);
        expect(variationId).toBeTruthy();

        // 2. Write a dev products doc matching the docToProduct shape:
        //    variants[] with the REAL squareVariationId, a createdAt so
        //    ProductRepository.findAll's orderBy('createdAt') returns it (the
        //    query handleInventoryUpdate scans), and a squareCache stub.
        const productId = randomUUID();
        createdProductIds.push(productId);
        const now = new Date();
        await withRetry('writeProduct', () =>
          db
            .collection('products')
            .doc(productId)
            .set({
              artistId: 'pos-dev-smoke-artist',
              categoryId: 'pos-dev-smoke-category',
              status: 'active',
              createdAt: now,
              updatedAt: now,
              variants: [
                {
                  id: 'variant-1',
                  label: 'Regular',
                  sku: `pos-dev-smoke-${randomUUID()}`,
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
                name: 'POS Dev Smoke Mug',
                description: 'Real sandbox retail item (Tier-2 smoke)',
                syncedAt: now,
                priceCents: 2500,
                quantity: INITIAL_QUANTITY,
                sku: 'pos-dev-smoke-sku',
              },
            })
        );

        // 3. Change the REAL sandbox inventory for that variation. Square emits
        //    inventory.count.updated and DELIVERS it to the deployed dev
        //    squareWebhook (no self-signing here).
        await square.inventoryService.setQuantity({
          squareVariationId: variationId,
          locationId,
          quantity: UPDATED_QUANTITY,
        });

        // 4. Wait for the delivered webhook → handleInventoryUpdate →
        //    updateCachedQuantity to flip the cached variant quantity.
        const variantQuantity = await withDeliveryHint(
          () =>
            pollFor(
              async () => {
                const snap = await withRetry('readProduct', () =>
                  db.collection('products').doc(productId).get()
                );
                const variants = snap.data()?.['variants'] as
                  | Array<Record<string, unknown>>
                  | undefined;
                const qty = variants?.[0]?.['quantity'] as number | undefined;
                return qty === UPDATED_QUANTITY ? qty : undefined;
              },
              {
                timeoutMs: INVENTORY_DELIVERY_TIMEOUT_MS,
                intervalMs: DELIVERY_POLL_INTERVAL_MS,
              }
            ),
          `Product cached quantity did not reach ${UPDATED_QUANTITY} for ` +
            `variation ${variationId} after ${INVENTORY_DELIVERY_TIMEOUT_MS}ms ` +
            `— check the DEV Square webhook subscription has ` +
            `inventory.count.updated enabled and pointed at the deployed ` +
            `squareWebhook (real delivery, not self-signed here).`
        );

        expect(variantQuantity).toBe(UPDATED_QUANTITY);
      },
      INVENTORY_DELIVERY_TIMEOUT_MS + 60_000
    );
  }
);

/** An ISO timestamp ~30 days out, for the class fixture's session dates. */
function futureIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
