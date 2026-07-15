/**
 * Integration tests for the in-person POS class-sale pipeline.
 *
 * Exercises the REAL chain end-to-end against the Firebase emulator:
 *
 *   signed `payment.updated` webhook POST  →  `squareWebhook` (maple-square
 *   emulator) verifies the HMAC and enqueues `posSaleRequests/{paymentId}`  →
 *   the `processPosSale` Firestore trigger fires, fetches payment/order/customer
 *   from the Square mock (redirected via SQUARE_BASE_URL)  →  creates a
 *   `source:'pos'` registration (and, when the sale carried no email, queues an
 *   admin `mail` alert).
 *
 * We assert exclusively via Firestore (the backbone — a `source:'pos'`
 * registration can only exist if the whole two-hop chain ran), plus the mock's
 * `/_mock/pos-fixture` seed route to stand up a deterministic
 * payment→order→customer graph.
 *
 * Signature scheme (CRITICAL): Square signs
 *   HMAC-SHA256(signatureKey, webhookUrl + rawBody) → base64
 * where the FUNCTION computes `webhookUrl` from
 * `FirebaseProject.functionUrl('squareWebhook')` — the DEPLOYED cloudfunctions
 * URL, NOT the localhost emulator URL — and `rawBody = JSON.stringify(req.body)`.
 * So the test signs over `SIGNED_URL + JSON.stringify(body)` with the harness
 * secret `mock-key` (tools/run-integration-tests.sh writes
 * SQUARE_WEBHOOK_SIGNATURE_KEY=mock-key).
 *
 * NOTE: requires the maple-square codebase built + loaded in the emulator and
 * the Square mock running on 9997(+offset). The harness
 * (`tools/run-integration-tests.sh class-square`) sets all of this up.
 */
import { createHmac } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  listFirestoreDocs,
  EMULATOR_CONFIG,
  PUBLISHED_CLASS,
} from '@maple/firebase/integration-test-utils';

const squareMockUrl = EMULATOR_CONFIG.squareMockServerUrl;

// The emulator squareWebhook endpoint we POST to.
const WEBHOOK_URL = `${EMULATOR_CONFIG.functionsHost}/${EMULATOR_CONFIG.projectId}/${EMULATOR_CONFIG.region}/squareWebhook`;

// The URL the function signs over — `FirebaseProject.functionUrl('squareWebhook')`
// resolves to `https://us-east4-<projectId>.cloudfunctions.net/squareWebhook`
// (projectId = GCLOUD_PROJECT = maple-and-spruce-dev under the emulator).
const SIGNED_URL = `https://us-east4-${EMULATOR_CONFIG.projectId}.cloudfunctions.net/squareWebhook`;

// Must match SQUARE_WEBHOOK_SIGNATURE_KEY in tools/run-integration-tests.sh.
const SIGNATURE_KEY = 'mock-key';

const ADMIN_EMAIL = 'katie@mapleandsprucefolkarts.com';

/** Sign a webhook body exactly the way the function's verifier does. */
function signWebhook(body: unknown): string {
  const raw = JSON.stringify(body);
  return createHmac('sha256', SIGNATURE_KEY)
    .update(SIGNED_URL + raw)
    .digest('base64');
}

/** POST a signed Square webhook to the emulator endpoint. */
async function postWebhook(
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const raw = JSON.stringify(body);
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-square-hmacsha256-signature': signWebhook(body),
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
 * A `payment.updated` webhook envelope. Only strings inside, so the function's
 * `JSON.stringify(req.body)` round-trips byte-identically to what we sign.
 */
function paymentUpdatedEvent(paymentId: string, orderId: string): unknown {
  return {
    merchant_id: 'ML-TEST',
    type: 'payment.updated',
    event_id: `evt-${paymentId}-${Date.now()}`,
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

interface PosFixture {
  payments?: Record<string, Record<string, unknown>>;
  orders?: Record<string, Record<string, unknown>>;
  customers?: Record<string, Record<string, unknown>>;
}

async function resetSquareMock(): Promise<void> {
  const res = await fetch(`${squareMockUrl}/_mock/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Square mock reset failed: ${res.status}`);
}

async function seedPosFixture(fixture: PosFixture): Promise<void> {
  const res = await fetch(`${squareMockUrl}/_mock/pos-fixture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fixture),
  });
  if (!res.ok) throw new Error(`Square mock seed failed: ${res.status}`);
}

/**
 * Wait long enough for BOTH async hops: webhook → posSaleRequests write, then
 * the processPosSale trigger → Square round-trip → registration create.
 */
function waitForTrigger(ms = 7000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** All registrations currently in Firestore. */
async function listRegistrations(): Promise<
  Array<{ id: string; data: Record<string, unknown> }>
> {
  return listFirestoreDocs('registrations');
}

/** Admin mail alerts flagged "needs an attendee email". */
async function listNoEmailAlerts(): Promise<
  Array<{ id: string; data: Record<string, unknown> }>
> {
  const mail = await listFirestoreDocs('mail');
  return mail.filter((doc) => {
    const message = doc.data['message'] as Record<string, unknown> | undefined;
    const subject = (message?.['subject'] as string | undefined) ?? '';
    return /needs an attendee email/i.test(subject);
  });
}

const CLASS_NAME = 'Integration POS Pottery';
const VARIATION_ID = 'pos-var-1';
const ITEM_ID = 'pos-item-1';

/**
 * Seed a published class pre-wired to a Square variation. Setting the Square
 * IDs up front keeps `syncClassToSquare` on the UPDATE branch — it never
 * rewrites `squareVariationId`, so the POS line item's `catalog_object_id`
 * stays resolvable via `findBySquareVariationId`.
 */
async function seedClass(classId: string): Promise<void> {
  await setFirestoreDoc('classes', classId, {
    ...PUBLISHED_CLASS,
    id: classId,
    name: CLASS_NAME,
    capacity: 8,
    priceCents: 4500,
    status: 'published',
    squareCatalogItemId: ITEM_ID,
    squareVariationId: VARIATION_ID,
    squareCatalogVersion: 1,
  });
}

/** A Square order line item (wire/snake_case) for the seeded class. */
function classLineItem(money: {
  base: number;
  gross: number;
  tax: number;
  total: number;
}): Record<string, unknown> {
  return {
    catalog_object_id: VARIATION_ID,
    name: CLASS_NAME,
    quantity: '1',
    base_price_money: { amount: money.base, currency: 'USD' },
    gross_sales_money: { amount: money.gross, currency: 'USD' },
    total_tax_money: { amount: money.tax, currency: 'USD' },
    total_money: { amount: money.total, currency: 'USD' },
  };
}

describe('POS class sale (squareWebhook → processPosSale, emulator + Square mock)', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await resetSquareMock();
  });

  it('A: creates a source:pos registration with the ACTUAL Square amounts and no admin alert', async () => {
    const classId = 'pos-class-a';
    const paymentId = 'pos-pay-A';
    const orderId = 'pos-order-A';
    const customerId = 'pos-cust-A';

    await seedClass(classId);
    await seedPosFixture({
      payments: {
        [paymentId]: {
          id: paymentId,
          status: 'COMPLETED',
          order_id: orderId,
          customer_id: customerId,
          receipt_url: 'https://squareupsandbox.com/receipt/pos/A',
          total_money: { amount: 3710, currency: 'USD' },
        },
      },
      orders: {
        [orderId]: {
          id: orderId,
          customer_id: customerId,
          total_money: { amount: 3710, currency: 'USD' },
          // A POS discount was applied: list price 4500 but Square charged a
          // 3500 subtotal + 210 tax = 3710. The registration MUST carry these.
          line_items: [
            classLineItem({ base: 4500, gross: 3500, tax: 210, total: 3710 }),
          ],
        },
      },
      customers: {
        [customerId]: {
          id: customerId,
          email_address: 'buyer@example.com',
          given_name: 'Grace',
          family_name: 'Hopper',
        },
      },
    });

    const res = await postWebhook(paymentUpdatedEvent(paymentId, orderId));
    expect(res.status).toBe(200);
    expect((res.body as { action?: string }).action).toBe('enqueued');

    await waitForTrigger();

    const registrations = await listRegistrations();
    const posRegs = registrations.filter((r) => r.data['source'] === 'pos');
    expect(posRegs).toHaveLength(1);

    const reg = posRegs[0].data;
    expect(reg['classId']).toBe(classId);
    expect(reg['squareOrderId']).toBe(orderId);
    expect(reg['squarePaymentId']).toBe(paymentId);
    expect(reg['customerEmail']).toBe('buyer@example.com');
    expect(reg['customerName']).toBe('Grace Hopper');
    expect(reg['status']).toBe('confirmed');
    // Part 1: exact Square line-item money, NOT the 4500/270/4770 reconstruction.
    expect(reg['subtotalCents']).toBe(3500);
    expect(reg['taxAmountCents']).toBe(210);
    expect(reg['pricePaidCents']).toBe(3710);

    // Buyer had an email → no admin alert.
    expect(await listNoEmailAlerts()).toHaveLength(0);
  });

  it('B: creates a placeholder registration and queues an admin alert when the sale has no email', async () => {
    const classId = 'pos-class-b';
    const paymentId = 'pos-pay-B';
    const orderId = 'pos-order-B';
    // customer_id present but NOT seeded → the mock serves an empty customer →
    // CustomersService.get returns null → no email, name falls back.
    const customerId = 'pos-cust-B-unseeded';

    await seedClass(classId);
    await seedPosFixture({
      payments: {
        [paymentId]: {
          id: paymentId,
          status: 'COMPLETED',
          order_id: orderId,
          customer_id: customerId,
          receipt_url: 'https://squareupsandbox.com/receipt/pos/B',
          total_money: { amount: 4770, currency: 'USD' },
        },
      },
      orders: {
        [orderId]: {
          id: orderId,
          customer_id: customerId,
          total_money: { amount: 4770, currency: 'USD' },
          line_items: [
            classLineItem({ base: 4500, gross: 4500, tax: 270, total: 4770 }),
          ],
        },
      },
      // customers intentionally NOT seeded for customerId.
    });

    const res = await postWebhook(paymentUpdatedEvent(paymentId, orderId));
    expect(res.status).toBe(200);

    await waitForTrigger();

    const posRegs = (await listRegistrations()).filter(
      (r) => r.data['source'] === 'pos'
    );
    expect(posRegs).toHaveLength(1);
    const reg = posRegs[0].data;
    expect(reg['classId']).toBe(classId);
    expect(reg['customerEmail']).toBe('');
    expect(reg['customerName']).toBe('POS Sale');

    const alerts = await listNoEmailAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].data['to']).toBe(ADMIN_EMAIL);
    const message = alerts[0].data['message'] as Record<string, unknown>;
    expect(message['subject']).toContain(CLASS_NAME);
  });

  it('C: skips web-originated orders (referenceId) — no duplicate POS registration', async () => {
    const classId = 'pos-class-c';
    const paymentId = 'pos-pay-C';
    const orderId = 'pos-order-C';
    const refId = 'web-reg-C';

    await seedClass(classId);

    // Pre-create the web registration the order's reference_id points at.
    await setFirestoreDoc('registrations', refId, {
      id: refId,
      classId,
      customerEmail: 'web-buyer@example.com',
      customerName: 'Web Buyer',
      quantity: 1,
      pricePaidCents: 4770,
      subtotalCents: 4500,
      taxAmountCents: 270,
      taxRatePercent: 6,
      status: 'confirmed',
      source: 'web',
      squareOrderId: orderId,
      squarePaymentId: paymentId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await seedPosFixture({
      payments: {
        [paymentId]: {
          id: paymentId,
          status: 'COMPLETED',
          order_id: orderId,
          receipt_url: 'https://squareupsandbox.com/receipt/pos/C',
          total_money: { amount: 4770, currency: 'USD' },
        },
      },
      orders: {
        [orderId]: {
          id: orderId,
          // Web checkout stamps the order's reference_id with the Firestore
          // registration id — the dedup key.
          reference_id: refId,
          total_money: { amount: 4770, currency: 'USD' },
          line_items: [
            classLineItem({ base: 4500, gross: 4500, tax: 270, total: 4770 }),
          ],
        },
      },
    });

    const res = await postWebhook(paymentUpdatedEvent(paymentId, orderId));
    expect(res.status).toBe(200);

    await waitForTrigger();

    // No NEW pos registration was created — the web order was deduped.
    const posRegs = (await listRegistrations()).filter(
      (r) => r.data['source'] === 'pos'
    );
    expect(posRegs).toHaveLength(0);

    // The pre-existing web registration is untouched.
    const webRegs = (await listRegistrations()).filter(
      (r) => r.data['source'] === 'web'
    );
    expect(webRegs).toHaveLength(1);
    expect(await listNoEmailAlerts()).toHaveLength(0);
  });
});
