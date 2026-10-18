/**
 * Integration tests for refunds made in the Square dashboard (#144).
 *
 * Exercises the REAL chain against the Firebase emulator:
 *
 *   signed `refund.updated` webhook POST  →  `squareWebhook` verifies the HMAC,
 *   matches the refund's payment id to a registration and folds the refund in
 *   (one Firestore transaction)  →  on a full refund the `refunded` status
 *   fires the `registrations/{id}` triggers, so `syncClassInventoryToSquare`
 *   gives the seat back to Square (PHYSICAL_COUNT back to capacity on the
 *   Square mock).
 *
 * Instructor payouts read `status: 'refunded'` / `refundedAt`, which is why a
 * dashboard refund has to reach the registration at all.
 *
 * Signing follows `pos-sale-webhook.spec.ts`: HMAC-SHA256 over the deployed
 * cloudfunctions URL + JSON body, with the harness key `mock-key`.
 *
 * All people are invented.
 */
import { createHmac } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearFirestoreEmulator,
  getFirestoreDoc,
  setFirestoreDoc,
  EMULATOR_CONFIG,
  PUBLISHED_CLASS,
  TRIGGER_WAIT_TIMEOUT_MS,
} from '@maple/firebase/integration-test-utils';

const squareMockUrl = EMULATOR_CONFIG.squareMockServerUrl;
const WEBHOOK_URL = `${EMULATOR_CONFIG.functionsHost}/${EMULATOR_CONFIG.projectId}/${EMULATOR_CONFIG.region}/squareWebhook`;
const SIGNED_URL = `https://us-east4-${EMULATOR_CONFIG.projectId}.cloudfunctions.net/squareWebhook`;
// Must match SQUARE_WEBHOOK_SIGNATURE_KEY in tools/run-integration-tests.sh.
const SIGNATURE_KEY = 'mock-key';

function signWebhook(body: unknown, secret: string): string {
  return createHmac('sha256', secret)
    .update(SIGNED_URL + JSON.stringify(body))
    .digest('base64');
}

async function postWebhook(
  body: unknown
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-square-hmacsha256-signature': signWebhook(body, SIGNATURE_KEY),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Record<string, unknown> = { raw: text };
  try {
    parsed = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { status: response.status, body: parsed };
}

/** A refund webhook envelope, shaped like Square's. */
function refundEvent(
  refund: {
    id: string;
    paymentId: string;
    orderId?: string;
    amountCents: number;
    status: string;
  },
  type: 'refund.created' | 'refund.updated' = 'refund.updated'
): unknown {
  return {
    merchant_id: 'ML-TEST',
    type,
    event_id: `evt-${refund.id}-${refund.status}`,
    created_at: '2026-10-15T15:00:00Z',
    data: {
      type: 'refund',
      id: refund.id,
      object: {
        refund: {
          id: refund.id,
          payment_id: refund.paymentId,
          ...(refund.orderId && { order_id: refund.orderId }),
          amount_money: { amount: refund.amountCents, currency: 'USD' },
          status: refund.status,
          updated_at: '2026-10-15T15:00:00Z',
        },
      },
    },
  };
}

async function pollUntil<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean
): Promise<T> {
  const deadline = Date.now() + TRIGGER_WAIT_TIMEOUT_MS;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    value = await read();
  }
  return value;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetSquareMock(): Promise<void> {
  const res = await fetch(`${squareMockUrl}/_mock/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Square mock reset failed: ${res.status}`);
}

/** Every PHYSICAL_COUNT quantity the mock saw for a variation. */
async function physicalCountsFor(variationId: string): Promise<string[]> {
  const res = await fetch(`${squareMockUrl}/_mock/requests`);
  if (!res.ok) throw new Error(`Square mock requests failed: ${res.status}`);
  const { requests = [] } = (await res.json()) as {
    requests?: Array<{ path: string; body: unknown }>;
  };
  const out: string[] = [];
  for (const req of requests) {
    if (!req.path.startsWith('/v2/inventory/changes/batch-create')) continue;
    const changes =
      ((req.body as Record<string, unknown>)['changes'] as Array<
        Record<string, Record<string, unknown> | undefined>
      >) ?? [];
    for (const change of changes) {
      const pc = change['physical_count'] ?? change['physicalCount'];
      const id = pc?.['catalog_object_id'] ?? pc?.['catalogObjectId'];
      if (pc && id === variationId) out.push(String(pc['quantity']));
    }
  }
  return out;
}

const CLASS_ID = 'refund-class-1';
const VARIATION_ID = 'refund-var-1';
const CAPACITY = 8;
const PRICE_CENTS = 6360;

async function seedClassAndSettle(): Promise<void> {
  await setFirestoreDoc('classes', CLASS_ID, {
    ...PUBLISHED_CLASS,
    id: CLASS_ID,
    name: 'Integration Refund Pottery',
    capacity: CAPACITY,
    status: 'published',
    squareCatalogItemId: 'refund-item-1',
    squareVariationId: VARIATION_ID,
    squareModifierListId: 'refund-modlist-1',
    squareCatalogVersion: 1,
  });
  await wait(5000);
}

/** A paid, confirmed registration carrying its Square payment id. */
async function seedConfirmedRegistration(
  id: string,
  paymentId: string,
  source: 'web' | 'pos' = 'web'
): Promise<void> {
  const now = new Date().toISOString();
  await setFirestoreDoc('registrations', id, {
    id,
    classId: CLASS_ID,
    customerEmail: 'robin@example.com',
    customerName: 'Robin Ashfield',
    quantity: 1,
    status: 'confirmed',
    source,
    pricePaidCents: PRICE_CENTS,
    subtotalCents: 6000,
    taxAmountCents: 360,
    taxRatePercent: 6.0,
    squarePaymentId: paymentId,
    squareOrderId: `${paymentId}-order`,
    createdAt: now,
    updatedAt: now,
  });
}

async function readRegistration(id: string): Promise<Record<string, unknown>> {
  return ((await getFirestoreDoc('registrations', id)) ?? {}) as Record<
    string,
    unknown
  >;
}

describe('Square dashboard refunds (squareWebhook refund.*, emulator)', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await resetSquareMock();
  });

  it('a full refund marks the registration refunded and gives the seat back', async () => {
    await seedClassAndSettle();
    await seedConfirmedRegistration('reg-full', 'pay-full');
    // Let the create-time inventory sync land, then watch only the refund's.
    await wait(5000);
    await resetSquareMock();

    const res = await postWebhook(
      refundEvent({
        id: 'rf-full',
        paymentId: 'pay-full',
        amountCents: PRICE_CENTS,
        status: 'COMPLETED',
      })
    );
    expect(res.status).toBe(200);
    expect(res.body['action']).toBe('refunded');

    const reg = await pollUntil(
      () => readRegistration('reg-full'),
      (r) => r['status'] === 'refunded'
    );
    expect(reg['status']).toBe('refunded');
    expect(reg['refundedAmountCents']).toBe(PRICE_CENTS);
    expect(reg['squareRefundId']).toBe('rf-full');
    expect(reg['squareRefundIds']).toEqual(['rf-full']);
    expect(reg['refundedAt']).toBeDefined();

    // syncClassInventoryToSquare fired on the status flip: the seat is free.
    const counts = await pollUntil(
      () => physicalCountsFor(VARIATION_ID),
      (c) => c.includes(String(CAPACITY))
    );
    expect(counts).toContain(String(CAPACITY));
  });

  it('a partial refund is recorded and keeps the student enrolled; a replay is a no-op', async () => {
    await seedConfirmedRegistration('reg-part', 'pay-part');

    const event = refundEvent({
      id: 'rf-part-1',
      paymentId: 'pay-part',
      amountCents: 2000,
      status: 'COMPLETED',
    });
    const first = await postWebhook(event);
    expect(first.status).toBe(200);
    expect(first.body['action']).toBe('partially-refunded');

    const reg = await pollUntil(
      () => readRegistration('reg-part'),
      (r) => r['refundedAmountCents'] === 2000
    );
    expect(reg['status']).toBe('confirmed');
    expect(reg['refundedAmountCents']).toBe(2000);
    expect(reg['squareRefundIds']).toEqual(['rf-part-1']);
    expect(reg['refundedAt']).toBeUndefined();

    // Square redelivers the identical event: nothing is counted twice.
    const replay = await postWebhook(event);
    expect(replay.status).toBe(200);
    expect(replay.body['action']).toBe('skipped');
    const afterReplay = await readRegistration('reg-part');
    expect(afterReplay['refundedAmountCents']).toBe(2000);
    expect(afterReplay['status']).toBe('confirmed');

    // A second partial refund that covers the rest makes it refunded.
    const rest = await postWebhook(
      refundEvent({
        id: 'rf-part-2',
        paymentId: 'pay-part',
        amountCents: PRICE_CENTS - 2000,
        status: 'COMPLETED',
      })
    );
    expect(rest.body['action']).toBe('refunded');
    const done = await readRegistration('reg-part');
    expect(done['status']).toBe('refunded');
    expect(done['refundedAmountCents']).toBe(PRICE_CENTS);
    expect(done['squareRefundIds']).toEqual(['rf-part-1', 'rf-part-2']);
  });

  it('ignores a pending refund and one that matches no class registration', async () => {
    await seedConfirmedRegistration('reg-pending', 'pay-pending');

    const pending = await postWebhook(
      refundEvent(
        {
          id: 'rf-pending',
          paymentId: 'pay-pending',
          amountCents: PRICE_CENTS,
          status: 'PENDING',
        },
        'refund.created'
      )
    );
    expect(pending.status).toBe(200);
    expect(pending.body['action']).toBe('skipped');

    // A lesson or shop sale: not a class registration.
    const other = await postWebhook(
      refundEvent({
        id: 'rf-other',
        paymentId: 'pay-not-a-class',
        amountCents: 1500,
        status: 'COMPLETED',
      })
    );
    expect(other.status).toBe(200);
    expect(other.body['action']).toBe('skipped');

    const reg = await readRegistration('reg-pending');
    expect(reg['status']).toBe('confirmed');
    expect(reg['refundedAmountCents']).toBeUndefined();
  });

  it('matches by order id when the payment id is not on a registration', async () => {
    await seedConfirmedRegistration('reg-order', 'pay-order');

    const res = await postWebhook(
      refundEvent({
        id: 'rf-order',
        paymentId: 'pay-unknown',
        orderId: 'pay-order-order',
        amountCents: PRICE_CENTS,
        status: 'COMPLETED',
      })
    );
    expect(res.body['action']).toBe('refunded');
    expect((await readRegistration('reg-order'))['status']).toBe('refunded');
  });

  it('flags both classes on a shared POS sale instead of refunding either; a replay is a no-op', async () => {
    // processPosSale writes one registration per class line, all on the
    // sale's payment, and the same sale may include shop items. Square's
    // refund does not say which item it was for.
    await seedConfirmedRegistration('reg-pos-a', 'pay-pos', 'pos');
    await seedConfirmedRegistration('reg-pos-b', 'pay-pos', 'pos');

    const event = refundEvent({
      id: 'rf-pos',
      paymentId: 'pay-pos',
      amountCents: 10000,
      status: 'COMPLETED',
    });
    const res = await postWebhook(event);
    expect(res.status).toBe(200);
    expect(res.body['action']).toBe('flagged');

    for (const id of ['reg-pos-a', 'reg-pos-b']) {
      const reg = await pollUntil(
        () => readRegistration(id),
        (r) => r['refundReviewId'] === 'rf-pos'
      );
      expect(reg['status']).toBe('confirmed');
      expect(reg['refundedAmountCents']).toBeUndefined();
      expect(reg['refundedAt']).toBeUndefined();
      expect(reg['refundReviewAmountCents']).toBe(10000);
      expect(reg['refundReviewAt']).toBeDefined();
      expect(reg['squareRefundIds']).toEqual(['rf-pos']);
    }

    const replay = await postWebhook(event);
    expect(replay.status).toBe(200);
    expect(replay.body['action']).toBe('skipped');
    for (const id of ['reg-pos-a', 'reg-pos-b']) {
      const reg = await readRegistration(id);
      expect(reg['squareRefundIds']).toEqual(['rf-pos']);
      expect(reg['status']).toBe('confirmed');
    }
  });
});

