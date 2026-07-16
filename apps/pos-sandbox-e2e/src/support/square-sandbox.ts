/**
 * Real-Square-sandbox support for the Tier-1 POS e2e suite.
 *
 * The Cloud Functions under test run in the Firebase emulator, but — because
 * the maple-square codebase's `.env` deliberately omits `SQUARE_BASE_URL` in
 * this job — the Square SDK inside those functions talks to the REAL Square
 * sandbox (`connect.squareupsandbox.com`). To drive those paths the TEST
 * process needs to talk to the same sandbox directly (create a catalog item's
 * order + payment, create a product's catalog item, tear both down). This
 * module builds a sandbox-scoped Square client from `process.env` and exposes
 * the raw SDK plus the self-signed-webhook helpers lifted from the mock-backed
 * `pos-sale-webhook.spec.ts`.
 *
 * Env the test process must provide (the CI job exports these; see
 * build-check.yml :: pos-sandbox-e2e):
 *   SQUARE_ACCESS_TOKEN   real sandbox access token (repo secret)
 *   SQUARE_LOCATION_ID    sandbox location id (public, from .env.dev)
 *   SQUARE_ENV            'LOCAL' → SDK sandbox environment (default LOCAL)
 *   SALES_TAX_RATE        e.g. '6.0' (public, from .env.dev)
 * `SQUARE_BASE_URL` must NOT be set in the test process, or the client would
 * be redirected away from the real sandbox (the Square wrapper honours it).
 */
import { createHmac, randomUUID } from 'crypto';
import type { SquareClient } from 'square';
import { Square } from '@maple/firebase/square';
import { EMULATOR_CONFIG } from '@maple/firebase/integration-test-utils';

/**
 * A per-run token so Square idempotency keys and catalog item names don't
 * collide across CI runs against the SHARED sandbox — Square remembers
 * idempotency keys server-side, so a reused key would replay a prior run's
 * (now-deleted) catalog object. A module-level counter keeps individual ids
 * readable and unique within a run.
 */
const RUN_ID = randomUUID();
let seq = 0;

/** A per-run-unique id/idempotency-key with a human-readable prefix. */
export function uniqueId(prefix: string): string {
  seq += 1;
  return `${prefix}-${RUN_ID}-${seq}`;
}

/**
 * Build a Square client bound to the real sandbox from `process.env`.
 *
 * Reuses the production `Square` wrapper (same credential resolution the
 * functions use) so the test exercises the same env contract. `.getClient()`
 * exposes the raw SDK for the direct catalog/order/payment calls below.
 */
export function sandboxSquare(): Square {
  const accessToken = process.env['SQUARE_ACCESS_TOKEN'];
  if (!accessToken) {
    throw new Error(
      'SQUARE_ACCESS_TOKEN must be set in the test process to reach the real ' +
        'Square sandbox. The CI job exports it from the SQUARE_SANDBOX_ACCESS_TOKEN secret.'
    );
  }
  const locationId = process.env['SQUARE_LOCATION_ID'];
  if (!locationId) {
    throw new Error(
      'SQUARE_LOCATION_ID must be set in the test process (public value from .env.dev).'
    );
  }
  if (process.env['SQUARE_BASE_URL']) {
    throw new Error(
      'SQUARE_BASE_URL is set — the test client would be redirected off the ' +
        'real sandbox. Unset it so this suite hits connect.squareupsandbox.com.'
    );
  }

  const secrets = { SQUARE_ACCESS_TOKEN: accessToken };
  const strings = {
    SQUARE_ENV: process.env['SQUARE_ENV'] ?? 'LOCAL',
    SQUARE_LOCATION_ID: locationId,
    SALES_TAX_RATE: process.env['SALES_TAX_RATE'] ?? '6.0',
  };
  return new Square(secrets, strings);
}

export interface CreatePosSaleInput {
  /** Square location id to create the order + payment under. */
  locationId: string;
  /** Catalog variation id (a class or product variation) to ring up. */
  catalogObjectId: string;
  /** Number of units to sell. */
  quantity: number;
  /** Sales-tax percentage string (e.g. '6.0'); adds an ORDER-scope tax. */
  taxPercentage: string;
}

export interface PosSaleResult {
  orderId: string;
  paymentId: string;
  /** Real order total (incl. tax) in cents, returned by the sandbox. */
  totalCents: number;
}

/**
 * Create a real sandbox ORDER (catalog line item, ORDER-scope tax, NO
 * referenceId — that's the web-dedup key POS orders leave unset) and pay it
 * with the sandbox test nonce. Uses the raw SDK directly rather than our
 * `OrdersService.createOrder`, which builds ad-hoc priced line items and never
 * sets `catalogObjectId` (the field `processPosSale` maps back to a class).
 */
export async function createPosOrderAndPayment(
  client: SquareClient,
  input: CreatePosSaleInput
): Promise<PosSaleResult> {
  const orderResponse = await client.orders.create({
    idempotencyKey: uniqueId('pos-order'),
    order: {
      locationId: input.locationId,
      lineItems: [
        {
          catalogObjectId: input.catalogObjectId,
          quantity: String(input.quantity),
        },
      ],
      taxes: [
        {
          name: 'WV Sales Tax',
          percentage: input.taxPercentage,
          scope: 'ORDER',
        },
      ],
    },
  });

  const order = orderResponse.order;
  if (!order?.id) {
    throw new Error('Sandbox order create returned no order id');
  }
  const totalCents = Number(order.totalMoney?.amount ?? 0);

  const paymentResponse = await client.payments.create({
    sourceId: 'cnon:card-nonce-ok',
    // Square caps the payment idempotency_key at 45 chars — a bare UUID (36)
    // fits and is unique per attempt; `uniqueId()` (prefix + UUID + seq) is 46+.
    idempotencyKey: randomUUID(),
    amountMoney: {
      amount: BigInt(totalCents),
      currency: 'USD',
    },
    orderId: order.id,
    locationId: input.locationId,
    autocomplete: true,
  });

  const paymentId = paymentResponse.payment?.id;
  if (!paymentId) {
    throw new Error('Sandbox payment create returned no payment id');
  }

  return { orderId: order.id, paymentId, totalCents };
}

export interface SandboxProduct {
  itemId: string;
  variationId: string;
}

/**
 * Create a real sandbox retail ITEM + single ITEM_VARIATION with
 * `trackInventory: true`. Returns the item id (for teardown) and the variation
 * id used as the `catalog_object_id` in the inventory webhook.
 */
export async function createSandboxProduct(
  client: SquareClient,
  input: { name: string; priceCents: number }
): Promise<SandboxProduct> {
  const sku = uniqueId('sku');
  const response = await client.catalog.batchUpsert({
    idempotencyKey: uniqueId('prod-create'),
    batches: [
      {
        objects: [
          {
            type: 'ITEM',
            id: `#item-${sku}`,
            itemData: {
              name: input.name,
              variations: [
                {
                  type: 'ITEM_VARIATION',
                  id: `#var-${sku}`,
                  itemVariationData: {
                    name: 'Regular',
                    sku,
                    pricingType: 'FIXED_PRICING',
                    priceMoney: {
                      amount: BigInt(input.priceCents),
                      currency: 'USD',
                    },
                    trackInventory: true,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const item = response.objects?.find((obj) => obj.type === 'ITEM');
  const variationId = item?.itemData?.variations?.[0]?.id;
  if (!item?.id || !variationId) {
    throw new Error('Sandbox product create returned no item/variation id');
  }
  return { itemId: item.id, variationId };
}

/**
 * Soft-delete a catalog object (item) in the sandbox. Tolerates a
 * not-found/already-deleted object so teardown never fails a green run.
 */
export async function deleteCatalogItem(
  client: SquareClient,
  itemId: string
): Promise<void> {
  try {
    await client.catalog.object.delete({ objectId: itemId });
  } catch {
    // Already gone / never created — nothing to clean up.
  }
}

// ---------------------------------------------------------------------------
// Self-signed webhook helpers (lifted from pos-sale-webhook.spec.ts).
//
// Square signs HMAC-SHA256(signatureKey, webhookUrl + rawBody) → base64, where
// the FUNCTION derives `webhookUrl` from `FirebaseProject.functionUrl(...)` —
// the DEPLOYED cloudfunctions URL, not the emulator URL — and
// `rawBody = JSON.stringify(req.body)`. So we sign over `SIGNED_URL +
// JSON.stringify(body)` with the harness key `mock-key`.
// ---------------------------------------------------------------------------

/** The emulator squareWebhook endpoint we POST to. */
export const WEBHOOK_URL = `${EMULATOR_CONFIG.functionsHost}/${EMULATOR_CONFIG.projectId}/${EMULATOR_CONFIG.region}/squareWebhook`;

/**
 * The URL the function signs over — `FirebaseProject.functionUrl('squareWebhook')`
 * resolves to `https://us-east4-<projectId>.cloudfunctions.net/squareWebhook`
 * under the emulator (projectId = GCLOUD_PROJECT = maple-and-spruce-dev).
 */
export const SIGNED_URL = `https://us-east4-${EMULATOR_CONFIG.projectId}.cloudfunctions.net/squareWebhook`;

/** Must match SQUARE_WEBHOOK_SIGNATURE_KEY in the CI job's .secret.local. */
export const SIGNATURE_KEY = 'mock-key';

/** Sign a webhook body exactly the way the function's verifier does. */
export function signWebhook(body: unknown, secret: string): string {
  const raw = JSON.stringify(body);
  return createHmac('sha256', secret)
    .update(SIGNED_URL + raw)
    .digest('base64');
}

/** POST a signed Square webhook to the emulator endpoint. */
export async function postWebhook(
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const raw = JSON.stringify(body);
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-square-hmacsha256-signature': signWebhook(body, SIGNATURE_KEY),
    },
    body: raw,
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { status: response.status, body: parsed };
}

/**
 * A `payment.updated` webhook envelope (all strings → the function's
 * `JSON.stringify(req.body)` round-trips byte-identically to what we sign).
 */
export function paymentUpdatedEvent(
  paymentId: string,
  orderId: string
): unknown {
  return {
    merchant_id: 'ML-SANDBOX',
    type: 'payment.updated',
    event_id: uniqueId('evt-pay'),
    created_at: new Date().toISOString(),
    data: {
      type: 'payment',
      id: paymentId,
      object: {
        payment: {
          id: paymentId,
          order_id: orderId,
          status: 'COMPLETED',
        },
      },
    },
  };
}

/**
 * An `inventory.count.updated` webhook envelope for one variation. `quantity`
 * is a string per Square's wire format; `handleInventoryUpdate` parses it and
 * matches `catalog_object_id` against a product's `squareVariationId`.
 */
export function inventoryUpdatedEvent(
  variationId: string,
  quantity: number,
  locationId: string
): unknown {
  return {
    merchant_id: 'ML-SANDBOX',
    type: 'inventory.count.updated',
    event_id: uniqueId('evt-inv'),
    created_at: new Date().toISOString(),
    data: {
      type: 'inventory_count',
      id: variationId,
      object: {
        inventory_counts: [
          {
            catalog_object_id: variationId,
            quantity: String(quantity),
            location_id: locationId,
            state: 'IN_STOCK',
          },
        ],
      },
    },
  };
}

/** Poll `fn` until it returns a defined value or the timeout elapses. */
export async function pollFor<T>(
  fn: () => Promise<T | undefined>,
  { timeoutMs, intervalMs = 1000 }: { timeoutMs: number; intervalMs?: number }
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result !== undefined) {
      return result;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`pollFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
