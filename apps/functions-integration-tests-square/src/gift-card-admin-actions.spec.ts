/**
 * The admin Gift Cards page's two actions (#310):
 * `giftCards/issueGiftCard` and `giftCards/markClassCertificate`.
 *
 * Runs the real routes in the emulator against real Firestore, with Square
 * served by the mock (`routes/gift-cards.ts`). The mock refuses an activation
 * without an order unless it carries an amount and a buyer payment instrument,
 * the way Square does, and keeps each card's history so the original loaded
 * amount can be read back.
 *
 * What only this level proves: a free card really ends up loaded in Square
 * with no order and no payment; the record lands in Firestore with the reason
 * and no code; a retried request makes one card; and a register card can be
 * made a class certificate once, at what was loaded, not what is left.
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
  IssueGiftCardRequest,
  IssueGiftCardResponse,
  MarkClassCertificateRequest,
  MarkClassCertificateResponse,
} from '@maple/ts/firebase/api-types';

const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;
const CATEGORY_ID = 'gc-admin-pottery';

type Recorded = { method: string; path: string; body: Record<string, unknown> };
type Wire = Record<string, unknown>;

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

async function squarePost(path: string, body: Wire): Promise<Wire> {
  const response = await fetch(`${SQUARE_MOCK}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await response.json()) as Wire;
}

/**
 * A card sold at the register, the way Square records it: an order with a
 * GIFT_CARD line, a digital card, and an activation against that line. Then
 * part of it is spent, so the balance differs from what was loaded.
 */
async function sellAtRegister(amountCents: number): Promise<string> {
  const { order } = (await squarePost('/v2/orders', {
    idempotency_key: `register-order-${amountCents}`,
    order: {
      location_id: 'mock-location',
      line_items: [
        {
          name: 'eGift Card',
          quantity: '1',
          item_type: 'GIFT_CARD',
          base_price_money: { amount: amountCents, currency: 'USD' },
        },
      ],
    },
  })) as { order: Wire };
  const { gift_card: card } = (await squarePost('/v2/gift-cards', {
    idempotency_key: `register-card-${amountCents}`,
    location_id: 'mock-location',
    gift_card: { type: 'DIGITAL' },
  })) as { gift_card: Wire };
  await squarePost('/v2/gift-cards/activities', {
    idempotency_key: `register-activate-${amountCents}`,
    gift_card_activity: {
      type: 'ACTIVATE',
      location_id: 'mock-location',
      gift_card_id: card['id'],
      activate_activity_details: {
        order_id: order['id'],
        line_item_uid: ((order['line_items'] as Wire[])[0] as Wire)['uid'],
      },
    },
  });
  await squarePost('/v2/gift-cards/activities', {
    idempotency_key: `register-redeem-${amountCents}`,
    gift_card_activity: {
      type: 'REDEEM',
      location_id: 'mock-location',
      gift_card_id: card['id'],
      redeem_activity_details: { amount_money: { amount: 1500, currency: 'USD' } },
    },
  });
  return card['id'] as string;
}

let keyCounter = 0;
function newKey(): string {
  keyCounter++;
  return `it-issue-${Date.now()}-${keyCounter}`;
}

describe('giftCards admin actions (#310)', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(NON_ADMIN_USER.email, NON_ADMIN_USER.password);
  }, 30000);

  // The Square mock restarts its card ids at `gftc:mock-1` on every reset, so
  // Firestore is cleared too, and the admin record written again after it.
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
      name: 'Pottery',
      order: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  const issue = (data: IssueGiftCardRequest, idToken = admin.idToken) =>
    callFunction<IssueGiftCardRequest, IssueGiftCardResponse>({
      functionName: 'giftCards/issueGiftCard',
      data,
      idToken,
    });

  const mark = (data: MarkClassCertificateRequest, idToken = admin.idToken) =>
    callFunction<MarkClassCertificateRequest, MarkClassCertificateResponse>({
      functionName: 'giftCards/markClassCertificate',
      data,
      idToken,
    });

  describe('issueGiftCard', () => {
    it('makes a $25 card, loads it with no order and no payment, and records why', async () => {
      const result = await issue({
        kind: 'amount',
        amountCents: 2500,
        reason: 'Raffle prize at the fall fair',
        recipientName: 'Olive Thompson',
        fromName: 'Maple & Spruce',
        idempotencyKey: newKey(),
      });

      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({
        kind: 'amount',
        valueCents: 2500,
        recorded: true,
      });
      expect(result.data?.last4).toMatch(/^\d{4}$/);
      // Only the last 4 ever leave the server here.
      expect(JSON.stringify(result.raw)).not.toMatch(/\d{16}/);

      const cards = await mockGiftCards();
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        id: result.data?.giftCardId,
        state: 'ACTIVE',
        balance_money: { amount: 2500, currency: 'USD' },
      });

      const requests = await squareRequests();
      expect(requests.some((r) => r.path === '/v2/orders')).toBe(false);
      expect(requests.some((r) => r.path === '/v2/payments')).toBe(false);
      const activation = requests.find(
        (r) => r.method === 'POST' && r.path === '/v2/gift-cards/activities'
      );
      const details = (activation?.body['gift_card_activity'] as Wire)[
        'activate_activity_details'
      ] as Wire;
      expect(details['amount_money']).toEqual({ amount: 2500, currency: 'USD' });
      expect(details['reference_id']).toMatch(/^comp-[0-9a-f]{12}$/);
      expect(details['buyer_payment_instrument_ids']).toEqual([details['reference_id']]);
      expect(details).not.toHaveProperty('order_id');

      const record = await getFirestoreDoc('giftCardPurchases', result.data!.giftCardId);
      expect(record).toMatchObject({
        kind: 'amount',
        valueCents: 2500,
        source: 'issued',
        reason: 'Raffle prize at the fall fair',
        recipientName: 'Olive Thompson',
        fromName: 'Maple & Spruce',
        recordedByUid: admin.uid,
        last4: result.data?.last4,
      });
      expect(record).not.toHaveProperty('buyerEmail');
      expect(JSON.stringify(record)).not.toContain(cards[0]['gan'] as string);
    });

    it('a class certificate is loaded with the value entered and remembers the class type', async () => {
      const result = await issue({
        kind: 'class',
        classCategoryId: CATEGORY_ID,
        valueCents: 6500,
        reason: 'Instructor thank-you',
        idempotencyKey: newKey(),
      });

      expect(result.status).toBe(200);
      expect(result.data).toMatchObject({ kind: 'class', valueCents: 6500, className: 'Pottery' });
      expect((await mockGiftCards())[0]).toMatchObject({
        balance_money: { amount: 6500, currency: 'USD' },
      });
      expect(await getFirestoreDoc('giftCardPurchases', result.data!.giftCardId)).toMatchObject({
        kind: 'class',
        classCategoryId: CATEGORY_ID,
        className: 'Pottery',
        source: 'issued',
      });
    });

    it('a retry with the same key makes one card, loaded once', async () => {
      const request: IssueGiftCardRequest = {
        kind: 'amount',
        amountCents: 4000,
        reason: 'Make-good for a cancelled class',
        idempotencyKey: newKey(),
      };

      const first = await issue(request);
      const second = await issue(request);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.data?.giftCardId).toBe(first.data?.giftCardId);
      const cards = await mockGiftCards();
      expect(cards).toHaveLength(1);
      expect(cards[0]['balance_money']).toEqual({ amount: 4000, currency: 'USD' });
      const activations = (await squareRequests()).filter(
        (r) => r.method === 'POST' && r.path === '/v2/gift-cards/activities'
      );
      expect(activations).toHaveLength(1);
    });

    it('refuses an amount over $500 before touching Square', async () => {
      const result = await issue({
        kind: 'amount',
        amountCents: 60000,
        reason: 'Too generous',
        idempotencyKey: newKey(),
      });

      expect(result.status).toBe(400);
      expect(result.error).toContain('amountCents');
      expect(await mockGiftCards()).toHaveLength(0);
    });

    it('is admin only', async () => {
      const result = await issue(
        { kind: 'amount', amountCents: 2500, reason: 'Not allowed', idempotencyKey: newKey() },
        nonAdmin.idToken
      );

      expect(result.status).toBe(403);
      expect(await mockGiftCards()).toHaveLength(0);
    });

    it('when Square cannot load the card, nothing is recorded', async () => {
      await squarePost('/_mock/gift-cards/fail-next-activation', { code: 'INTERNAL_SERVER_ERROR' });

      const result = await issue({
        kind: 'amount',
        amountCents: 2500,
        reason: 'Raffle prize',
        idempotencyKey: newKey(),
      });

      expect(result.status).toBe(400);
      expect(result.error).toContain('nothing was given');
      const cards = await mockGiftCards();
      expect(cards[0]).toMatchObject({ state: 'PENDING' });
      expect(await getFirestoreDoc('giftCardPurchases', cards[0]['id'] as string)).toBeNull();
    });
  });

  describe('markClassCertificate', () => {
    it('records a register card at what was loaded, and refuses it the second time', async () => {
      const giftCardId = await sellAtRegister(6500);

      const first = await mark({
        giftCardId,
        classCategoryId: CATEGORY_ID,
        recipientName: 'Olive Thompson',
        fromName: 'Robin Ashfield',
      });

      expect(first.status).toBe(200);
      expect(first.data?.purchase).toMatchObject({
        giftCardId,
        kind: 'class',
        valueCents: 6500,
        source: 'register',
        className: 'Pottery',
        classCategoryName: 'Pottery',
      });
      expect(await getFirestoreDoc('giftCardPurchases', giftCardId)).toMatchObject({
        kind: 'class',
        valueCents: 6500,
        source: 'register',
        classCategoryId: CATEGORY_ID,
        recipientName: 'Olive Thompson',
        fromName: 'Robin Ashfield',
        recordedByUid: admin.uid,
      });

      // The card still shows what is left; the certificate is worth what was loaded.
      expect((await mockGiftCards())[0]['balance_money']).toEqual({ amount: 5000, currency: 'USD' });
      const writesToSquare = (await squareRequests()).filter(
        (r) =>
          r.method === 'POST' &&
          r.path.startsWith('/v2/') &&
          !String(r.body['idempotency_key'] ?? '').startsWith('register-')
      );
      expect(writesToSquare).toEqual([]);

      const second = await mark({ giftCardId, classCategoryId: CATEGORY_ID });
      expect(second.status).toBe(400);
      expect(second.error).toContain('already a $65 class certificate for Pottery');
    });

    it('refuses a card given free by the studio', async () => {
      const issued = await issue({
        kind: 'amount',
        amountCents: 2500,
        reason: 'Raffle prize',
        idempotencyKey: newKey(),
      });

      const result = await mark({
        giftCardId: issued.data!.giftCardId,
        classCategoryId: CATEGORY_ID,
      });

      expect(result.status).toBe(400);
      expect(result.error).toContain('given free by the studio');
    });

    it('refuses a card that was never loaded', async () => {
      const { gift_card: card } = (await squarePost('/v2/gift-cards', {
        idempotency_key: 'pending-card',
        location_id: 'mock-location',
        gift_card: { type: 'DIGITAL' },
      })) as { gift_card: Wire };

      const result = await mark({
        giftCardId: card['id'] as string,
        classCategoryId: CATEGORY_ID,
      });

      expect(result.status).toBe(400);
      expect(result.error).toContain('Only an active card');
      expect(await getFirestoreDoc('giftCardPurchases', card['id'] as string)).toBeNull();
    });

    it('is admin only', async () => {
      const giftCardId = await sellAtRegister(5000);
      const result = await mark({ giftCardId, classCategoryId: CATEGORY_ID }, nonAdmin.idToken);
      expect(result.status).toBe(403);
      expect(await getFirestoreDoc('giftCardPurchases', giftCardId)).toBeNull();
    });
  });
});
