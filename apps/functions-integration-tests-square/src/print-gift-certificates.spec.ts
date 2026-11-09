/**
 * Printed gift certificates (#314, #332): `giftCards/printGiftCertificates`,
 * `giftCards/getCertificateBatch`, and what the page shows once the register
 * sells one (`getGiftCards`, `getGiftCardBuyer`, `searchGiftCardsByCustomer`).
 *
 * Runs the real routes in the emulator against real Firestore, with Square
 * served by the mock (`routes/gift-cards.ts`), which is idempotent by key the
 * way Square is and refuses a code already in use.
 *
 * What only this level proves: every certificate in a batch really ends up in
 * Square with a MAPLE code and NO money on it (pending, no activation, no
 * order, no payment), a record per card lands in Firestore as printed stock
 * with no code, a retry of the same batch makes no extra cards, a year whose
 * codes are used up fails clearly, the print view gets every code while
 * non-admins get nothing, and a certificate the register sells moves from
 * "not sold" to sold and owed, with its buyer readable and findable.
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
  GetGiftCardBuyerRequest,
  GetGiftCardBuyerResponse,
  GetGiftCardsRequest,
  GetGiftCardsResponse,
  PrintGiftCertificatesRequest,
  PrintGiftCertificatesResponse,
  SearchGiftCardsByCustomerRequest,
  SearchGiftCardsByCustomerResponse,
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

/** The year in the studio's time zone, as the codes use. */
function studioYear(): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
  }).format(new Date());
}

let keyCounter = 0;
function newKey(): string {
  keyCounter++;
  return `it-print-${Date.now()}-${keyCounter}`;
}

describe('printed gift certificates (#314, #332)', () => {
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

  it('makes every certificate with a MAPLE code and no money, and records each as printed stock', async () => {
    const result = await print(amountBatch(3));

    expect(result.status).toBe(200);
    expect(result.data?.cards).toHaveLength(3);
    expect(result.data?.error).toBeUndefined();
    // Only last 4s leave the server here.
    expect(JSON.stringify(result.raw)).not.toMatch(/MAPLE\d|\d{16}/);

    const cards = await mockGiftCards();
    expect(cards).toHaveLength(3);
    const year = studioYear();
    for (const card of cards) {
      expect(card).toMatchObject({
        state: 'PENDING',
        gan_source: 'OTHER',
        balance_money: { amount: 0, currency: 'USD' },
      });
      expect(String(card['gan'])).toMatch(new RegExp(`^MAPLE${year}\\d{3}$`));
    }

    const requests = await squareRequests();
    expect(requests.some((r) => r.path === '/v2/gift-cards/activities')).toBe(false);
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

  it('a retry of the same batch makes no extra cards', async () => {
    const request = amountBatch(2);
    const first = await print(request);
    const second = await print(request);

    expect(second.status).toBe(200);
    expect(second.data?.cards).toEqual(first.data?.cards);
    expect(await mockGiftCards()).toHaveLength(2);
    for (const card of await mockGiftCards()) {
      expect(card['state']).toBe('PENDING');
    }
  });

  it('fails clearly, recording nothing, when every code this year is taken', async () => {
    // Square already has all 1,000 of this year's codes.
    const year = studioYear();
    for (let n = 0; n < 1000; n++) {
      await fetch(`${SQUARE_MOCK}/v2/gift-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotency_key: `fill-${n}`,
          location_id: 'mock-location',
          gift_card: {
            type: 'DIGITAL',
            gan: `MAPLE${year}${String(n).padStart(3, '0')}`,
            gan_source: 'OTHER',
          },
        }),
      });
    }

    const result = await print(amountBatch(1));

    expect(result.status).not.toBe(200);
    expect(JSON.stringify(result.raw)).toMatch(/nearly used up/);
    expect(JSON.stringify(result.raw)).not.toMatch(/MAPLE\d/);
    expect(await mockGiftCards()).toHaveLength(1000);
  }, 60000);

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
    expect(await getFirestoreDoc('giftCardPurchases', result.data!.cards[0].giftCardId)).toMatchObject({
      kind: 'class',
      valueCents: 8500,
      classCategoryId: CATEGORY_ID,
    });
    expect((await mockGiftCards())[0]['balance_money']).toEqual({ amount: 0, currency: 'USD' });
  });

  it('gives the print view every code, and the page counts them as not sold, not owed', async () => {
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
      printedNotSoldCount: 2,
      outstandingCents: 0,
      loadedThisMonthCents: 0,
    });
    expect(page.data?.cards.every((c) => c.source === 'stock' && c.state === 'pending')).toBe(
      true
    );
  });

  it('once the register sells one, it counts as sold and owed, and its buyer is on file', async () => {
    const printed = await print(amountBatch(2));
    const batch = await readBatch({ batchId: printed.data!.batchId });
    const sold = batch.data!.certificates[0];

    // An invented customer, added to the sale at the register.
    await fetch(`${SQUARE_MOCK}/_mock/gift-cards/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customers: [
          {
            id: 'cust-robin',
            given_name: 'Robin',
            family_name: 'Ashfield',
            email_address: 'robin@example.com',
            phone_number: '+13045550142',
          },
        ],
      }),
    });
    const sale = await fetch(`${SQUARE_MOCK}/_mock/gift-cards/register-sale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gan: sold.code, amount: 2500, customer_id: 'cust-robin' }),
    });
    expect(sale.status).toBe(200);

    const page = await callFunction<GetGiftCardsRequest, GetGiftCardsResponse>({
      functionName: 'giftCards/getGiftCards',
      data: {},
      idToken: admin.idToken,
    });
    expect(page.data?.totals).toMatchObject({
      printedNotSoldCount: 1,
      outstandingCents: 2500,
      cardsWithBalance: 1,
      loadedThisMonthCents: 2500,
    });

    const buyer = await callFunction<GetGiftCardBuyerRequest, GetGiftCardBuyerResponse>({
      functionName: 'giftCards/getGiftCardBuyer',
      data: { id: sold.giftCardId },
      idToken: admin.idToken,
    });
    expect(buyer.status).toBe(200);
    expect(buyer.data?.sale?.customer).toEqual({
      id: 'cust-robin',
      name: 'Robin Ashfield',
      email: 'robin@example.com',
      phone: '+13045550142',
    });
    // Nothing about the customer is stored.
    const record = await getFirestoreDoc('giftCardPurchases', sold.giftCardId);
    expect(JSON.stringify(record)).not.toMatch(/Robin|robin@|555/);

    const found = await callFunction<
      SearchGiftCardsByCustomerRequest,
      SearchGiftCardsByCustomerResponse
    >({
      functionName: 'giftCards/searchGiftCardsByCustomer',
      data: { query: 'robin@example' },
      idToken: admin.idToken,
    });
    expect(found.status).toBe(200);
    expect(found.data?.matches).toEqual([
      { customer: expect.objectContaining({ id: 'cust-robin' }), giftCardIds: [sold.giftCardId] },
    ]);
    expect(found.data?.cards.map((c) => c.id)).toEqual([sold.giftCardId]);
    expect(found.data?.cards[0]).toMatchObject({ source: 'stock', state: 'active' });

    const byPhone = await callFunction<
      SearchGiftCardsByCustomerRequest,
      SearchGiftCardsByCustomerResponse
    >({
      functionName: 'giftCards/searchGiftCardsByCustomer',
      data: { query: '(304) 555-0142' },
      idToken: admin.idToken,
    });
    expect(byPhone.data?.cards.map((c) => c.id)).toEqual([sold.giftCardId]);

    const byName = await callFunction<
      SearchGiftCardsByCustomerRequest,
      SearchGiftCardsByCustomerResponse
    >({
      functionName: 'giftCards/searchGiftCardsByCustomer',
      data: { query: 'robin ash' },
      idToken: admin.idToken,
    });
    expect(byName.data?.cards.map((c) => c.id)).toEqual([sold.giftCardId]);

    const notAdmin = await callFunction<GetGiftCardBuyerRequest, GetGiftCardBuyerResponse>({
      functionName: 'giftCards/getGiftCardBuyer',
      data: { id: sold.giftCardId },
      idToken: nonAdmin.idToken,
    });
    expect(notAdmin.status).not.toBe(200);
    expect(JSON.stringify(notAdmin.raw)).not.toMatch(/Robin/);
  });

  it('is admin only', async () => {
    const printed = await print(amountBatch(1), nonAdmin.idToken);
    expect(printed.status).not.toBe(200);
    expect(await mockGiftCards()).toHaveLength(0);

    const ok = await print(amountBatch(1));
    const read = await readBatch({ batchId: ok.data!.batchId }, nonAdmin.idToken);
    expect(read.status).not.toBe(200);
    expect(JSON.stringify(read.raw)).not.toMatch(/MAPLE\d|\d{16}/);
  });
});
