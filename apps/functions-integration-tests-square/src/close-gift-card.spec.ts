/**
 * Refunding and turning off a gift card: `giftCards/closeGiftCard`.
 *
 * Runs the real route in the emulator against real Firestore, with Square
 * served by the mock (`routes/gift-cards.ts`), which keeps balances the way
 * Square does.
 *
 * What only this level proves: the requests the route makes are ones Square
 * accepts (ADJUST_DECREMENT, a refund on the original payment, DEACTIVATE),
 * the card ends at $0 and turned off, our record keeps the closure, a failed
 * last step can be finished by trying again without refunding twice, and only
 * an admin can do it.
 */
import {
  ADMIN_USER,
  NON_ADMIN_USER,
  callFunction,
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  EMULATOR_CONFIG,
  getFirestoreDoc,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  CloseGiftCardRequest,
  CloseGiftCardResponse,
} from '@maple/ts/firebase/api-types';

const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;

type Wire = Record<string, unknown>;

async function postMock(path: string, body: unknown): Promise<Response> {
  return fetch(`${SQUARE_MOCK}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

let keyCounter = 0;
function newKey(): string {
  keyCounter++;
  return `it-close-${Date.now()}-${keyCounter}`;
}

/** A loaded card for `amount` cents. */
async function loadedCard(amount: number): Promise<string> {
  const created = (await (
    await postMock('/v2/gift-cards', {
      idempotency_key: newKey(),
      location_id: 'mock-location',
      gift_card: { type: 'DIGITAL' },
    })
  ).json()) as { gift_card: Wire };
  const sale = await postMock('/_mock/gift-cards/register-sale', {
    gan: created.gift_card['gan'],
    amount,
  });
  expect(sale.status).toBe(200);
  return created.gift_card['id'] as string;
}

async function card(id: string): Promise<{ balance: number; state: string }> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/gift-cards`)).json()) as {
    giftCards: Wire[];
  };
  const c = body.giftCards.find((g) => g['id'] === id) as Wire;
  return {
    balance: Number((c['balance_money'] as Wire)['amount']),
    state: String(c['state']),
  };
}

async function refundRequests(): Promise<Wire[]> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/requests`)).json()) as {
    requests: { method: string; path: string; body: Wire }[];
  };
  return body.requests
    .filter((r) => r.method === 'POST' && r.path === '/v2/refunds')
    .map((r) => r.body);
}

/** Our record of a card bought on the website. */
async function boughtOnline(giftCardId: string, valueCents: number): Promise<void> {
  await setFirestoreDoc('giftCardPurchases', giftCardId, {
    last4: '',
    kind: 'amount',
    valueCents,
    source: 'online',
    buyerName: 'Robin Ashfield',
    buyerEmail: 'robin@example.com',
    deliverTo: 'buyer',
    squareOrderId: 'sq-order-online',
    squarePaymentId: 'sq-pay-online',
    createdAt: new Date().toISOString(),
  });
}

describe('refunding and turning off a gift card', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(NON_ADMIN_USER.email, NON_ADMIN_USER.password);
  }, 30000);

  beforeEach(async () => {
    await fetch(`${SQUARE_MOCK}/_mock/reset`, { method: 'POST' });
    await clearFirestoreEmulator();
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  const close = (data: CloseGiftCardRequest, idToken = admin.idToken) =>
    callFunction<CloseGiftCardRequest, CloseGiftCardResponse>({
      functionName: 'giftCards/closeGiftCard',
      data,
      idToken,
    });

  it('refunds what is left on a card bought online and turns it off', async () => {
    const id = await loadedCard(4000);
    await boughtOnline(id, 4000);

    const result = await close({ giftCardId: id, mode: 'refund' });

    expect(result.status).toBe(200);
    expect(result.data).toEqual({
      giftCardId: id,
      mode: 'refund',
      amountCents: 4000,
      refundedCents: 4000,
    });
    expect(await card(id)).toEqual({ balance: 0, state: 'DEACTIVATED' });
    const refunds = await refundRequests();
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      payment_id: 'sq-pay-online',
      amount_money: { amount: 4000, currency: 'USD' },
    });
    const record = await getFirestoreDoc('giftCardPurchases', id);
    expect(record?.['closure']).toMatchObject({
      kind: 'refund',
      amountCents: 4000,
      byUid: admin.uid,
    });
    expect((record?.['closure'] as Wire)['completedAt']).toBeTruthy();
  });

  it('a failed turn-off is finished by trying again, without refunding twice', async () => {
    const id = await loadedCard(2500);
    await boughtOnline(id, 2500);
    await postMock('/_mock/gift-cards/fail-next-activity', { type: 'DEACTIVATE' });

    const first = await close({ giftCardId: id, mode: 'refund' });
    expect(first.status).toBe(200);
    expect(first.data?.warning).toMatch(/did not turn the card off/);
    expect(await card(id)).toEqual({ balance: 0, state: 'ACTIVE' });

    const second = await close({ giftCardId: id, mode: 'refund' });
    expect(second.status).toBe(200);
    expect(second.data?.warning).toBeUndefined();
    expect(await card(id)).toEqual({ balance: 0, state: 'DEACTIVATED' });
    // Square's key returns the first refund; no second refund of the money.
    const refunds = await refundRequests();
    expect(new Set(refunds.map((r) => r['idempotency_key'])).size).toBe(1);
  });

  it('turns off a card sold at the register without refunding anything', async () => {
    const id = await loadedCard(3000);

    const result = await close({ giftCardId: id, mode: 'deactivate' });

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ mode: 'deactivate', amountCents: 3000, refundedCents: 0 });
    expect(await card(id)).toEqual({ balance: 0, state: 'DEACTIVATED' });
    expect(await refundRequests()).toEqual([]);
  });

  it('will not refund a card that was not bought on the website', async () => {
    const id = await loadedCard(3000);
    const result = await close({ giftCardId: id, mode: 'refund' });
    expect(result.status).not.toBe(200);
    expect(await card(id)).toEqual({ balance: 3000, state: 'ACTIVE' });
  });

  it('is admin only', async () => {
    const id = await loadedCard(2000);
    await boughtOnline(id, 2000);
    const result = await close({ giftCardId: id, mode: 'refund' }, nonAdmin.idToken);
    expect(result.status).not.toBe(200);
    expect(await card(id)).toEqual({ balance: 2000, state: 'ACTIVE' });
    expect(await refundRequests()).toEqual([]);
  });
});
