/**
 * Replacing a lost gift card (#332): `giftCards/replaceGiftCard`.
 *
 * Runs the real route in the emulator against real Firestore, with Square
 * served by the mock (`routes/gift-cards.ts`), which keeps balances the way
 * Square does: a decrement cannot take more than the balance, a turned-off
 * card stays off, and the same key never moves money twice.
 *
 * What only this level proves: the SDK requests the route makes are ones
 * Square accepts (ADJUST_DECREMENT with a reason, an order-less ACTIVATE,
 * DEACTIVATE with a reason), the balance ends up on exactly the new card, our
 * record links the new card to the lost one, a failure part way never leaves
 * the balance on both cards, and a retry finishes the job.
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
  GetGiftCardsRequest,
  GetGiftCardsResponse,
  ReplaceGiftCardRequest,
  ReplaceGiftCardResponse,
} from '@maple/ts/firebase/api-types';

const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;

type Wire = Record<string, unknown>;

async function mockGiftCards(): Promise<Wire[]> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/gift-cards`)).json()) as {
    giftCards: Wire[];
  };
  return body.giftCards;
}

async function postMock(path: string, body: unknown): Promise<Response> {
  return fetch(`${SQUARE_MOCK}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** A card sold at the register for `amount` cents: made, then loaded against an order. */
async function cardSoldAtRegister(amount: number): Promise<string> {
  const created = (await (
    await postMock('/v2/gift-cards', {
      idempotency_key: `it-replace-${Date.now()}-${Math.random()}`,
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

/** Where the money is: the lost card's and every other card's balance and state. */
async function where(lostId: string) {
  const cards = await mockGiftCards();
  const lost = cards.find((c) => c['id'] === lostId) as Wire;
  const others = cards.filter((c) => c['id'] !== lostId);
  const amount = (c: Wire) => Number((c['balance_money'] as Wire)['amount']);
  return {
    lost: amount(lost),
    lostState: lost['state'],
    others: others.map(amount),
    otherStates: others.map((c) => c['state']),
  };
}

let keyCounter = 0;
function newKey(): string {
  keyCounter++;
  return `it-replace-${Date.now()}-${keyCounter}`;
}

describe('replacing a lost gift card (#332)', () => {
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

  const replace = (data: ReplaceGiftCardRequest, idToken = admin.idToken) =>
    callFunction<ReplaceGiftCardRequest, ReplaceGiftCardResponse>({
      functionName: 'giftCards/replaceGiftCard',
      data,
      idToken,
    });

  it('moves the balance to a new card, turns the lost one off, and records the link', async () => {
    const lostId = await cardSoldAtRegister(4000);

    const result = await replace({ giftCardId: lostId, idempotencyKey: newKey() });

    expect(result.status).toBe(200);
    expect(result.data).toMatchObject({ oldGiftCardId: lostId, balanceCents: 4000 });
    expect(result.data?.warning).toBeUndefined();
    expect(await where(lostId)).toEqual({
      lost: 0,
      lostState: 'DEACTIVATED',
      others: [4000],
      otherStates: ['ACTIVE'],
    });
    // Only last 4 digits leave the server.
    expect(JSON.stringify(result.raw)).not.toMatch(/\d{16}/);

    const record = await getFirestoreDoc('giftCardPurchases', result.data!.newGiftCardId);
    expect(record).toMatchObject({
      source: 'replacement',
      replacesGiftCardId: lostId,
      valueCents: 4000,
      last4: result.data!.last4,
      recordedByUid: admin.uid,
    });

    // The page owes the same amount as before, and the move is not a sale.
    const page = await callFunction<GetGiftCardsRequest, GetGiftCardsResponse>({
      functionName: 'giftCards/getGiftCards',
      data: {},
      idToken: admin.idToken,
    });
    expect(page.data?.totals).toMatchObject({ outstandingCents: 4000, loadedThisMonthCents: 4000 });
    expect(page.data?.cards.find((c) => c.id === result.data!.newGiftCardId)?.source).toBe(
      'replacement'
    );
  });

  it('a second click changes nothing and answers the same', async () => {
    const lostId = await cardSoldAtRegister(2500);
    const first = await replace({ giftCardId: lostId, idempotencyKey: newKey() });
    const second = await replace({ giftCardId: lostId, idempotencyKey: newKey() });

    expect(second.status).toBe(200);
    expect(second.data).toEqual(first.data);
    expect(await mockGiftCards()).toHaveLength(2);
    expect(await where(lostId)).toMatchObject({ lost: 0, others: [2500] });
  });

  it('when Square cannot load the new card, the money is on neither card, never both, and a retry finishes', async () => {
    const lostId = await cardSoldAtRegister(3000);
    await postMock('/_mock/gift-cards/fail-next-activity', { type: 'ACTIVATE' });
    const key = newKey();

    const failed = await replace({ giftCardId: lostId, idempotencyKey: key });
    expect(failed.status).not.toBe(200);
    expect(JSON.stringify(failed.raw)).toMatch(/Nothing is lost: try again/);
    expect(await where(lostId)).toEqual({
      lost: 0,
      lostState: 'ACTIVE',
      others: [0],
      otherStates: ['PENDING'],
    });

    const retried = await replace({ giftCardId: lostId, idempotencyKey: key });
    expect(retried.status).toBe(200);
    expect(await where(lostId)).toEqual({
      lost: 0,
      lostState: 'DEACTIVATED',
      others: [3000],
      otherStates: ['ACTIVE'],
    });
  });

  it('when Square cannot take the money off, the lost card keeps it and nothing else moves', async () => {
    const lostId = await cardSoldAtRegister(3000);
    await postMock('/_mock/gift-cards/fail-next-activity', { type: 'ADJUST_DECREMENT' });

    const failed = await replace({ giftCardId: lostId, idempotencyKey: newKey() });
    expect(failed.status).not.toBe(200);
    expect(await where(lostId)).toMatchObject({ lost: 3000, lostState: 'ACTIVE', others: [0] });

    const retried = await replace({ giftCardId: lostId, idempotencyKey: newKey() });
    expect(retried.status).toBe(200);
    expect(await where(lostId)).toMatchObject({ lost: 0, others: [3000] });
  });

  it('when Square cannot turn the lost card off, says so; it holds nothing; a retry turns it off', async () => {
    const lostId = await cardSoldAtRegister(1500);
    await postMock('/_mock/gift-cards/fail-next-activity', { type: 'DEACTIVATE' });

    const result = await replace({ giftCardId: lostId, idempotencyKey: newKey() });
    expect(result.status).toBe(200);
    expect(result.data?.warning).toMatch(/did not turn the lost card off/);
    expect(await where(lostId)).toMatchObject({ lost: 0, lostState: 'ACTIVE', others: [1500] });

    const retried = await replace({ giftCardId: lostId, idempotencyKey: newKey() });
    expect(retried.data?.warning).toBeUndefined();
    expect((await where(lostId)).lostState).toBe('DEACTIVATED');
  });

  it('refuses a printed certificate that was never sold', async () => {
    const created = (await (
      await postMock('/v2/gift-cards', {
        idempotency_key: newKey(),
        location_id: 'mock-location',
        gift_card: { type: 'DIGITAL' },
      })
    ).json()) as { gift_card: Wire };

    const result = await replace({
      giftCardId: created.gift_card['id'] as string,
      idempotencyKey: newKey(),
    });
    expect(result.status).not.toBe(200);
    expect(JSON.stringify(result.raw)).toMatch(/not been sold yet/);
    expect(await mockGiftCards()).toHaveLength(1);
  });

  it('is admin only', async () => {
    const lostId = await cardSoldAtRegister(2000);
    const result = await replace({ giftCardId: lostId, idempotencyKey: newKey() }, nonAdmin.idToken);
    expect(result.status).not.toBe(200);
    expect(await where(lostId)).toEqual({
      lost: 2000,
      lostState: 'ACTIVE',
      others: [],
      otherStates: [],
    });
  });
});
