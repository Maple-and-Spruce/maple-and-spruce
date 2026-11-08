/**
 * Printed gift certificates (#314): `giftCards/printGiftCertificates` and
 * `giftCards/getCertificateBatch`.
 *
 * Runs the real routes in the emulator against real Firestore, with Square
 * served by the mock (`routes/gift-cards.ts`), which is idempotent by key the
 * way Square is.
 *
 * What only this level proves: every certificate in a batch really ends up
 * loaded in Square with no order and no payment, a record per card lands in
 * Firestore as printed stock with no code, a retry of the same batch makes no
 * extra cards, a batch that failed part way is finished by a retry, and the
 * print view gets every code while non-admins get nothing.
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
  GetCertificateBatchRequest,
  GetCertificateBatchResponse,
  GetGiftCardsRequest,
  GetGiftCardsResponse,
  PrintGiftCertificatesRequest,
  PrintGiftCertificatesResponse,
} from '@maple/ts/firebase/api-types';

const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;
const CATEGORY_ID = 'print-cert-glass';

type Wire = Record<string, unknown>;
type Recorded = { method: string; path: string; body: Wire };

async function squareRequests(): Promise<Recorded[]> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/requests`)).json()) as {
    requests: Recorded[];
  };
  return body.requests;
}

async function mockGiftCards(): Promise<Wire[]> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/gift-cards`)).json()) as {
    giftCards: Wire[];
  };
  return body.giftCards;
}

let keyCounter = 0;
function newKey(): string {
  keyCounter++;
  return `it-print-${Date.now()}-${keyCounter}`;
}

describe('printed gift certificates (#314)', () => {
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
    await setFirestoreDoc('classCategories', CATEGORY_ID, {
      name: 'Stained Glass',
      order: 1,
      giftCertificateEnabled: true,
      giftCertificatePriceCents: 8500,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  const print = (data: PrintGiftCertificatesRequest, idToken = admin.idToken) =>
    callFunction<PrintGiftCertificatesRequest, PrintGiftCertificatesResponse>({
      functionName: 'giftCards/printGiftCertificates',
      data,
      idToken,
    });

  const readBatch = (data: GetCertificateBatchRequest, idToken = admin.idToken) =>
    callFunction<GetCertificateBatchRequest, GetCertificateBatchResponse>({
      functionName: 'giftCards/getCertificateBatch',
      data,
      idToken,
    });

  const amountBatch = (quantity: number): PrintGiftCertificatesRequest => ({
    kind: 'amount',
    amountCents: 2500,
    quantity,
    design: 'stained-glass',
    idempotencyKey: newKey(),
  });

  it('loads every certificate in Square and records each as printed stock', async () => {
    const result = await print(amountBatch(3));

    expect(result.status).toBe(200);
    expect(result.data?.cards).toHaveLength(3);
    expect(result.data?.error).toBeUndefined();
    // Only last 4s leave the server here.
    expect(JSON.stringify(result.raw)).not.toMatch(/\d{16}/);

    const cards = await mockGiftCards();
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card).toMatchObject({
        state: 'ACTIVE',
        balance_money: { amount: 2500, currency: 'USD' },
      });
    }

    const requests = await squareRequests();
    expect(requests.some((r) => r.path === '/v2/orders')).toBe(false);
    expect(requests.some((r) => r.path === '/v2/payments')).toBe(false);

    const batchId = result.data!.batchId;
    for (const [index, printed] of result.data!.cards.entries()) {
      const record = await getFirestoreDoc('giftCardPurchases', printed.giftCardId);
      expect(record).toMatchObject({
        source: 'stock',
        kind: 'amount',
        valueCents: 2500,
        batchId,
        batchIndex: index,
        design: 'stained-glass',
        recordedByUid: admin.uid,
        last4: printed.last4,
      });
      const gan = cards.find((c) => c['id'] === printed.giftCardId)?.['gan'] as string;
      expect(JSON.stringify(record)).not.toContain(gan);
    }
  });

  it('a retry of the same batch makes no extra cards and loads nothing twice', async () => {
    const request = amountBatch(2);
    const first = await print(request);
    const second = await print(request);

    expect(second.status).toBe(200);
    expect(second.data?.cards).toEqual(first.data?.cards);
    expect(await mockGiftCards()).toHaveLength(2);
    const activations = (await squareRequests()).filter(
      (r) => r.method === 'POST' && r.path === '/v2/gift-cards/activities'
    );
    // The retry re-sends the same keys; Square answers with the same activity.
    const keys = new Set(activations.map((r) => r.body['idempotency_key']));
    expect(keys.size).toBe(2);
    for (const card of await mockGiftCards()) {
      expect(card['balance_money']).toEqual({ amount: 2500, currency: 'USD' });
    }
  });

  it('keeps what was made when Square fails part way, and a retry finishes the batch', async () => {
    const request = amountBatch(1);
    await fetch(`${SQUARE_MOCK}/_mock/gift-cards/fail-next-activation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INTERNAL_SERVER_ERROR' }),
    });

    const failed = await print(request);
    expect(failed.status).not.toBe(200);
    // The card exists but holds nothing, and nothing was recorded.
    const pending = await mockGiftCards();
    expect(pending).toHaveLength(1);
    expect(pending[0]['state']).toBe('PENDING');

    const retried = await print(request);
    expect(retried.status).toBe(200);
    expect(retried.data?.cards).toHaveLength(1);
    const cards = await mockGiftCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      state: 'ACTIVE',
      balance_money: { amount: 2500, currency: 'USD' },
    });
  });

  it('prices a class batch from the class type', async () => {
    const result = await print({
      kind: 'class',
      classCategoryId: CATEGORY_ID,
      quantity: 1,
      design: 'stained-glass',
      idempotencyKey: newKey(),
    });

    expect(result.status).toBe(200);
    expect(result.data?.valueCents).toBe(8500);
    expect((await mockGiftCards())[0]['balance_money']).toEqual({ amount: 8500, currency: 'USD' });
  });

  it('gives the print view every code, and the page counts them as printed, not owed', async () => {
    const printed = await print(amountBatch(2));
    const batch = await readBatch({ batchId: printed.data!.batchId });

    expect(batch.status).toBe(200);
    const gans = (await mockGiftCards()).map((c) => c['gan']);
    expect(batch.data?.certificates.map((c) => c.code).sort()).toEqual([...gans].sort());
    expect(batch.data).toMatchObject({ design: 'stained-glass', kind: 'amount', valueCents: 2500 });

    const page = await callFunction<GetGiftCardsRequest, GetGiftCardsResponse>({
      functionName: 'giftCards/getGiftCards',
      data: {},
      idToken: admin.idToken,
    });
    expect(page.status).toBe(200);
    expect(page.data?.totals).toMatchObject({
      printedUnusedCents: 5000,
      printedUnusedCount: 2,
      outstandingCents: 0,
      loadedThisMonthCents: 0,
    });
    expect(page.data?.cards.every((c) => c.source === 'stock')).toBe(true);
  });

  it('is admin only', async () => {
    const printed = await print(amountBatch(1), nonAdmin.idToken);
    expect(printed.status).not.toBe(200);
    expect(await mockGiftCards()).toHaveLength(0);

    const ok = await print(amountBatch(1));
    const read = await readBatch({ batchId: ok.data!.batchId }, nonAdmin.idToken);
    expect(read.status).not.toBe(200);
    expect(JSON.stringify(read.raw)).not.toMatch(/\d{16}/);
  });
});
