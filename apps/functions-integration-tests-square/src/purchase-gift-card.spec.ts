/**
 * Buying a gift card on our own buy page (#300): `giftCards/purchaseGiftCard`.
 *
 * Runs the real route in the emulator against real Firestore, with Square
 * served by the mock (`routes/gift-cards.ts`). The mock behaves like Square
 * where it matters here: the order computes its own total from its lines, an
 * activation must name an order and a GIFT_CARD line that exist, and the
 * amount loaded comes from that line, not from the caller.
 *
 * What only this level proves: the order, payment, card and activation agree
 * with each other; the purchase record and both emails land in Firestore with
 * no full code where it should not be; and when activation fails the payment
 * is refunded and nothing is recorded or emailed.
 */
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  listFirestoreDocs,
  callFunction,
  EMULATOR_CONFIG,
} from '@maple/firebase/integration-test-utils';
import type {
  PurchaseGiftCardRequest,
  PurchaseGiftCardResponse,
} from '@maple/ts/firebase/api-types';

const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;
const ROUTE = 'giftCards/purchaseGiftCard';

type Recorded = { method: string; path: string; body: Record<string, unknown> };

async function squareRequests(): Promise<Recorded[]> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/requests`)).json()) as {
    requests: Recorded[];
  };
  return body.requests;
}

async function mockGiftCards(): Promise<Array<Record<string, unknown>>> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/gift-cards`)).json()) as {
    giftCards: Array<Record<string, unknown>>;
  };
  return body.giftCards;
}

function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

const CATEGORY_ID = 'gc-test-category';
const CLASS_ID = 'gc-test-class';

let keyCounter = 0;
function newKey(): string {
  keyCounter++;
  return `it-gift-${Date.now()}-${keyCounter}`;
}

function amountRequest(over: Partial<PurchaseGiftCardRequest> = {}): PurchaseGiftCardRequest {
  return {
    kind: 'amount',
    amountCents: 5000,
    buyerName: 'Robin Ashfield',
    buyerEmail: 'robin@example.com',
    recipientName: 'Olive Thompson',
    recipientEmail: 'olive@example.com',
    message: 'Happy birthday!',
    deliverTo: 'recipient',
    sourceId: 'cnon:card-nonce-ok',
    idempotencyKey: newKey(),
    ...over,
  } as PurchaseGiftCardRequest;
}

async function mailTo(address: string): Promise<Array<Record<string, unknown>>> {
  const docs = await listFirestoreDocs('mail');
  return docs.map((d) => d.data).filter((m) => m['to'] === address);
}

describe('giftCards/purchaseGiftCard', () => {
  beforeAll(async () => {
    await clearFirestoreEmulator();
    await setFirestoreDoc('classCategories', CATEGORY_ID, {
      name: 'Pottery',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setFirestoreDoc('classes', CLASS_ID, {
      name: 'Beginner Wheel',
      description: 'Center and throw your first cylinder.',
      dateTime: futureDate(),
      durationMinutes: 120,
      capacity: 6,
      priceCents: 6500,
      skillLevel: 'beginner',
      status: 'published',
      categoryId: CATEGORY_ID,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  beforeEach(async () => {
    await fetch(`${SQUARE_MOCK}/_mock/reset`, { method: 'POST' });
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  it('sells a $50 card: one untaxed GIFT_CARD order, paid, then activated against that line', async () => {
    const result = await callFunction<PurchaseGiftCardRequest, PurchaseGiftCardResponse>({
      functionName: ROUTE,
      data: amountRequest(),
    });

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      kind: 'amount',
      valueCents: 5000,
      deliverTo: 'recipient',
      sentTo: 'olive@example.com',
    });
    expect(result.data?.last4).toMatch(/^\d{4}$/);
    // The browser only ever gets the last 4.
    expect(JSON.stringify(result.raw)).not.toMatch(/\d{16}/);

    const requests = await squareRequests();
    const order = requests.find((r) => r.method === 'POST' && r.path === '/v2/orders');
    const orderBody = order?.body['order'] as Record<string, unknown>;
    expect(orderBody['line_items']).toEqual([
      expect.objectContaining({
        item_type: 'GIFT_CARD',
        quantity: '1',
        base_price_money: { amount: 5000, currency: 'USD' },
      }),
    ]);
    expect(orderBody['taxes'] ?? []).toEqual([]);
    expect(orderBody['reference_id']).toMatch(/^giftcard-/);

    const payment = requests.find((r) => r.method === 'POST' && r.path === '/v2/payments');
    expect(payment?.body).toMatchObject({
      amount_money: { amount: 5000, currency: 'USD' },
      order_id: 'mock-gc-order-1',
      buyer_email_address: 'robin@example.com',
    });

    const activation = requests.find(
      (r) => r.method === 'POST' && r.path === '/v2/gift-cards/activities'
    );
    expect(activation?.body['gift_card_activity']).toMatchObject({
      type: 'ACTIVATE',
      gift_card_id: result.data?.giftCardId,
      activate_activity_details: {
        order_id: 'mock-gc-order-1',
        line_item_uid: 'mock-gc-order-1-line-1',
      },
    });

    const [card] = await mockGiftCards();
    expect(card).toMatchObject({
      id: result.data?.giftCardId,
      state: 'ACTIVE',
      balance_money: { amount: 5000, currency: 'USD' },
    });
    const gan = card['gan'] as string;
    expect(gan.slice(-4)).toBe(result.data?.last4);

    // The record keeps who it was for and the last 4, never the code.
    const record = await getFirestoreDoc('giftCardPurchases', result.data!.giftCardId);
    expect(record).toMatchObject({
      last4: result.data?.last4,
      kind: 'amount',
      valueCents: 5000,
      buyerName: 'Robin Ashfield',
      buyerEmail: 'robin@example.com',
      recipientName: 'Olive Thompson',
      recipientEmail: 'olive@example.com',
      message: 'Happy birthday!',
      deliverTo: 'recipient',
      squareOrderId: 'mock-gc-order-1',
    });
    expect(JSON.stringify(record)).not.toContain(gan);

    // The recipient gets the code; the buyer gets only the last 4.
    const [gift] = await mailTo('olive@example.com');
    expect(gift['template']).toMatchObject({
      name: 'gift-card',
      data: {
        description: '$50',
        buyerName: 'Robin Ashfield',
        message: 'Happy birthday!',
        code: gan.replace(/(.{4})/g, '$1 ').trim(),
      },
    });
    const [confirmation] = await mailTo('robin@example.com');
    expect(confirmation['template']).toMatchObject({
      name: 'gift-card-purchase-confirmation',
      data: { last4: result.data?.last4, recipientEmail: 'olive@example.com' },
    });
    expect(JSON.stringify(confirmation)).not.toContain(gan);
  });

  it('sells a class certificate at the class price and records the class type', async () => {
    const result = await callFunction<PurchaseGiftCardRequest, PurchaseGiftCardResponse>({
      functionName: ROUTE,
      data: {
        ...amountRequest({ deliverTo: 'buyer', buyerEmail: 'robin.class@example.com' }),
        kind: 'class',
        classId: CLASS_ID,
      } as PurchaseGiftCardRequest,
    });

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({
      kind: 'class',
      valueCents: 6500,
      className: 'Beginner Wheel',
      sentTo: 'robin.class@example.com',
    });
    const record = await getFirestoreDoc('giftCardPurchases', result.data!.giftCardId);
    expect(record).toMatchObject({
      kind: 'class',
      valueCents: 6500,
      classId: CLASS_ID,
      classCategoryId: CATEGORY_ID,
      className: 'Beginner Wheel',
      deliverTo: 'buyer',
    });
    const mail = await mailTo('robin.class@example.com');
    expect(mail).toHaveLength(1);
    expect(mail[0]['template']).toMatchObject({
      name: 'gift-card',
      data: {
        forBuyer: true,
        isClass: true,
        description:
          'One Pottery class at Maple & Spruce (Beginner Wheel or any class of that type)',
      },
    });
  });

  it('refunds the payment when Square cannot activate the card, and records nothing', async () => {
    await fetch(`${SQUARE_MOCK}/_mock/gift-cards/fail-next-activation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INTERNAL_SERVER_ERROR' }),
    });

    const result = await callFunction<PurchaseGiftCardRequest, PurchaseGiftCardResponse>({
      functionName: ROUTE,
      data: amountRequest({ buyerEmail: 'refund.buyer@example.com', recipientEmail: 'refund.friend@example.com' }),
    });

    expect(result.status).toBe(400);
    expect(JSON.stringify(result.raw)).toContain('refunded your payment');

    const requests = await squareRequests();
    const refund = requests.find((r) => r.method === 'POST' && r.path === '/v2/refunds');
    expect(refund?.body).toMatchObject({
      amount_money: { amount: 5000, currency: 'USD' },
      reason: 'Gift card could not be created',
    });
    expect(refund?.body['payment_id']).toMatch(/^mock-payment-/);

    const [card] = await mockGiftCards();
    expect(card['state']).toBe('PENDING');
    expect(await getFirestoreDoc('giftCardPurchases', card['id'] as string)).toBeNull();
    expect(await mailTo('refund.friend@example.com')).toHaveLength(0);
    expect(await mailTo('refund.buyer@example.com')).toHaveLength(0);
  });

  it('a retried request with the same key charges once and makes one card', async () => {
    const data = amountRequest({ buyerEmail: 'retry@example.com', recipientEmail: 'retry.friend@example.com' });

    const first = await callFunction<PurchaseGiftCardRequest, PurchaseGiftCardResponse>({
      functionName: ROUTE,
      data,
    });
    const second = await callFunction<PurchaseGiftCardRequest, PurchaseGiftCardResponse>({
      functionName: ROUTE,
      data,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.data?.giftCardId).toBe(first.data?.giftCardId);
    expect(await mockGiftCards()).toHaveLength(1);
    // Emails went out once.
    expect(await mailTo('retry.friend@example.com')).toHaveLength(1);
  });

  it('refuses an amount outside $10 to $500 before touching Square', async () => {
    const result = await callFunction<PurchaseGiftCardRequest, PurchaseGiftCardResponse>({
      functionName: ROUTE,
      data: amountRequest({ amountCents: 60000 } as Partial<PurchaseGiftCardRequest>),
    });
    expect(result.status).toBe(400);
    const requests = await squareRequests();
    expect(requests.filter((r) => r.path.startsWith('/v2/'))).toHaveLength(0);
  });
});
