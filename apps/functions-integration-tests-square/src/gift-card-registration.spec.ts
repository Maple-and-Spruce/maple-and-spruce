/**
 * Paying for a class with a gift card (#301), end to end against the
 * emulators and the Square mock.
 *
 * The mock's gift card routes (`gift-card-payments.ts`) hold a balance per
 * seeded card, approve only what a card holds, and give a held amount back on
 * cancel or refund, so these tests can check that a family's gift card
 * balance is right after each path, not just that some calls were made.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  listFirestoreDocs,
  callFunction,
  EMULATOR_CONFIG,
  ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  CancelRegistrationRequest,
  CancelRegistrationResponse,
  CreateRegistrationRequest,
  CreateRegistrationResponse,
  PreviewGiftCardForClassRequest,
  PreviewGiftCardForClassResponse,
} from '@maple/ts/firebase/api-types';

const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;

function futureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

/** A $45 pottery class: $47.70 with 6% tax. */
const POTTERY_CLASS_ID = 'gc-pottery-class';
const WEAVING_CLASS_ID = 'gc-weaving-class';
const baseClass = {
  description: 'A class for testing gift card checkout.',
  dateTime: futureDate(),
  durationMinutes: 120,
  capacity: 20,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

interface MockRequest {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

async function squareRequests(prefix: string): Promise<MockRequest[]> {
  const body = (await (await fetch(`${SQUARE_MOCK}/_mock/requests`)).json()) as {
    requests: MockRequest[];
  };
  return body.requests.filter(
    (r) => r.method === 'POST' && r.path.startsWith(prefix)
  );
}

async function seedGiftCard(card: {
  nonce: string;
  id: string;
  balanceCents: number;
  state?: string;
}): Promise<void> {
  await fetch(`${SQUARE_MOCK}/_mock/gift-cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cards: [{ gan: `7783320000004821`, ...card }],
    }),
  });
}

async function balanceOf(giftCardId: string): Promise<number> {
  const res = await fetch(`${SQUARE_MOCK}/_mock/gift-cards/${giftCardId}`);
  const body = (await res.json()) as { card: { balanceCents: number } };
  return body.card.balanceCents;
}

async function declineNextCard(): Promise<void> {
  await fetch(`${SQUARE_MOCK}/_mock/decline-next-payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'CARD_DECLINED' }),
  });
}

let emailCounter = 0;
function register(
  data: Partial<CreateRegistrationRequest>
): ReturnType<typeof callFunction<CreateRegistrationRequest, CreateRegistrationResponse>> {
  emailCounter++;
  return callFunction<CreateRegistrationRequest, CreateRegistrationResponse>({
    functionName: 'createRegistration',
    data: {
      classId: POTTERY_CLASS_ID,
      customerEmail: `gift-family-${emailCounter}@example.com`,
      customerName: 'Robin Ashfield',
      quantity: 1,
      paymentNonce: '',
      ...data,
    },
  });
}

describe('createRegistration with a gift card (#301)', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
    await setFirestoreDoc('classes', POTTERY_CLASS_ID, {
      ...baseClass,
      name: 'Gift Card Pottery',
      categoryId: 'cat-pottery',
    });
    await setFirestoreDoc('classes', WEAVING_CLASS_ID, {
      ...baseClass,
      name: 'Gift Card Weaving',
      categoryId: 'cat-weaving',
    });
  });

  beforeEach(async () => {
    await fetch(`${SQUARE_MOCK}/_mock/reset`, { method: 'POST' });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('pays the whole class from a gift card with enough on it', async () => {
    await seedGiftCard({ nonce: 'gftok:full', id: 'gc-full', balanceCents: 10000 });

    const result = await register({ giftCardNonce: 'gftok:full' });

    expect(result.status).toBe(200);
    const registration = result.data!.registration;
    expect(registration.status).toBe('confirmed');
    expect(registration.pricePaidCents).toBe(4770);
    expect(registration.giftCardPaidCents).toBe(4770);
    expect(registration.cardPaidCents).toBe(0);
    expect(registration.giftCardLast4).toBe('4821');
    expect(registration.squareGiftCardPaymentId).toBeDefined();
    expect(registration.squarePaymentId).toBe(registration.squareGiftCardPaymentId);
    expect(await balanceOf('gc-full')).toBe(10000 - 4770);

    const pay = await squareRequests(`/v2/orders/${registration.squareOrderId}/pay`);
    expect(pay).toHaveLength(1);
    expect(pay[0].body['payment_ids']).toEqual([registration.squareGiftCardPaymentId]);
  });

  it('splits between a gift card and a card', async () => {
    await seedGiftCard({ nonce: 'gftok:split', id: 'gc-split', balanceCents: 2000 });

    const result = await register({
      giftCardNonce: 'gftok:split',
      paymentNonce: 'cnon:card-nonce-ok',
    });

    expect(result.status).toBe(200);
    const registration = result.data!.registration;
    expect(registration.giftCardPaidCents).toBe(2000);
    expect(registration.cardPaidCents).toBe(2770);
    expect(registration.pricePaidCents).toBe(4770);
    expect(registration.squarePaymentId).not.toBe(registration.squareGiftCardPaymentId);
    expect(await balanceOf('gc-split')).toBe(0);

    const payments = await squareRequests('/v2/payments');
    const card = payments.find((p) => p.body['source_id'] === 'cnon:card-nonce-ok');
    expect(card?.body['amount_money']).toEqual({ amount: 2770, currency: 'USD' });
    expect(card?.body['autocomplete']).toBe(false);
    const pay = await squareRequests(`/v2/orders/${registration.squareOrderId}/pay`);
    expect(pay[0].body['payment_ids']).toEqual([
      registration.squareGiftCardPaymentId,
      registration.squarePaymentId,
    ]);
  });

  it('gives the gift card balance back and books nothing when the card is declined', async () => {
    await seedGiftCard({ nonce: 'gftok:decl', id: 'gc-decl', balanceCents: 2000 });
    await declineNextCard();
    const email = `declined-${Date.now()}@example.com`;

    const result = await callFunction<CreateRegistrationRequest, CreateRegistrationResponse>({
      functionName: 'createRegistration',
      data: {
        classId: POTTERY_CLASS_ID,
        customerEmail: email,
        customerName: 'Olive Thompson',
        quantity: 1,
        paymentNonce: 'cnon:card-nonce-declined',
        giftCardNonce: 'gftok:decl',
      },
    });

    expect(result.status).not.toBe(200);
    expect(JSON.stringify(result.raw)).toMatch(/declined/i);
    expect(await balanceOf('gc-decl')).toBe(2000);
    const cancels = await squareRequests('/v2/payments/mock-gc-payment-');
    expect(cancels.some((r) => r.path.endsWith('/cancel'))).toBe(true);
    expect(await squareRequests('/v2/orders/mock-order-gc-')).toEqual([]);

    const regs = await listFirestoreDocs('registrations');
    const mine = regs.filter((r) => r.data['customerEmail'] === email);
    expect(mine).toHaveLength(1);
    expect(mine[0].data['status']).toBe('cancelled');
  });

  it('refuses before charging when the gift card is short and no card was given', async () => {
    await seedGiftCard({ nonce: 'gftok:short', id: 'gc-short', balanceCents: 1000 });

    const result = await register({ giftCardNonce: 'gftok:short' });

    expect(result.status).not.toBe(200);
    expect(JSON.stringify(result.raw)).toContain('Please enter a card for the rest');
    expect(await balanceOf('gc-short')).toBe(1000);
    const giftPayments = (await squareRequests('/v2/payments')).filter(
      (p) => p.body['source_id'] === 'gftok:short'
    );
    expect(giftPayments).toEqual([]);
  });

  it('refuses an empty or unknown gift card without holding a seat', async () => {
    await seedGiftCard({ nonce: 'gftok:empty', id: 'gc-empty', balanceCents: 0 });

    const empty = await register({
      customerEmail: 'empty-card@example.com',
      giftCardNonce: 'gftok:empty',
    });
    const unknown = await register({
      customerEmail: 'unknown-card@example.com',
      giftCardNonce: 'gftok:nobody',
    });

    expect(JSON.stringify(empty.raw)).toContain('no money left');
    expect(JSON.stringify(unknown.raw)).toContain("couldn't find that gift card");
    const held = (await listFirestoreDocs('registrations')).filter((r) =>
      ['empty-card@example.com', 'unknown-card@example.com'].includes(
        r.data['customerEmail'] as string
      )
    );
    expect(held).toEqual([]);
  });

  describe('class certificates', () => {
    beforeAll(async () => {
      // A $40 certificate for a pottery class.
      await setFirestoreDoc('giftCardPurchases', 'gc-cert', {
        last4: '4821',
        kind: 'class',
        valueCents: 4000,
        classId: 'an-earlier-pottery-class',
        classCategoryId: 'cat-pottery',
        className: 'Pottery Basics',
        buyerName: 'Robin Ashfield',
        buyerEmail: 'robin@example.com',
        deliverTo: 'buyer',
        squareOrderId: 'sq-order-cert',
        squarePaymentId: 'sq-pay-cert',
        createdAt: new Date().toISOString(),
      });
    });

    it('covers up to 10% of the certificate when the class costs more', async () => {
      await seedGiftCard({ nonce: 'gftok:cert', id: 'gc-cert', balanceCents: 4000 });

      const result = await register({
        giftCardNonce: 'gftok:cert',
        paymentNonce: 'cnon:card-nonce-ok',
      });

      expect(result.status).toBe(200);
      const registration = result.data!.registration;
      // $45 class, $40 on the card: $5 short, capped at 10% of $40 = $4.
      expect(registration.classCertificateCoverCents).toBe(400);
      // $41 after the cover, + $2.46 tax.
      expect(registration.pricePaidCents).toBe(4346);
      expect(registration.taxAmountCents).toBe(246);
      expect(registration.subtotalCents).toBe(4500);
      expect(registration.giftCardPaidCents).toBe(4000);
      expect(registration.cardPaidCents).toBe(346);

      const [order] = await squareRequests('/v2/orders');
      const discounts = (order.body['order'] as Record<string, unknown>)['discounts'];
      expect(discounts).toEqual([
        expect.objectContaining({
          name: 'Class certificate',
          amount_money: { amount: 400, currency: 'USD' },
          scope: 'ORDER',
        }),
      ]);
    });

    it('covers nothing for another kind of class', async () => {
      await seedGiftCard({ nonce: 'gftok:cert2', id: 'gc-cert', balanceCents: 4000 });

      const result = await register({
        classId: WEAVING_CLASS_ID,
        giftCardNonce: 'gftok:cert2',
        paymentNonce: 'cnon:card-nonce-ok',
      });

      expect(result.status).toBe(200);
      const registration = result.data!.registration;
      expect(registration.classCertificateCoverCents).toBeUndefined();
      expect(registration.pricePaidCents).toBe(4770);
      expect(registration.cardPaidCents).toBe(770);
    });

    it('previews the same numbers the checkout charges', async () => {
      await seedGiftCard({ nonce: 'gftok:prev', id: 'gc-cert', balanceCents: 4000 });

      const result = await callFunction<
        PreviewGiftCardForClassRequest,
        PreviewGiftCardForClassResponse
      >({
        functionName: 'giftCards/previewGiftCardForClass',
        data: { giftCardNonce: 'gftok:prev', classId: POTTERY_CLASS_ID, quantity: 1 },
      });

      expect(result.status).toBe(200);
      expect(result.data).toEqual({
        last4: '4821',
        balanceCents: 4000,
        classCertificateCoverCents: 400,
        subtotalCents: 4500,
        taxAmountCents: 246,
        totalCents: 4346,
        giftCardAmountCents: 4000,
        leftToPayCents: 346,
      });
      // A preview charges nothing.
      expect(await squareRequests('/v2/payments')).toEqual([]);
    });
  });

  it('refunds each share to where it came from when the registration is cancelled', async () => {
    await seedGiftCard({ nonce: 'gftok:refund', id: 'gc-refund', balanceCents: 2000 });
    const created = await register({
      giftCardNonce: 'gftok:refund',
      paymentNonce: 'cnon:card-nonce-ok',
    });
    expect(created.status).toBe(200);
    const registration = created.data!.registration;
    expect(await balanceOf('gc-refund')).toBe(0);

    const result = await callFunction<CancelRegistrationRequest, CancelRegistrationResponse>({
      functionName: 'cancelRegistration',
      data: { id: registration.id, refund: true },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.registration.status).toBe('refunded');
    expect(result.data?.registration.refundedAmountCents).toBe(4770);
    expect(result.data?.registration.squareRefundIds).toHaveLength(2);
    expect(await balanceOf('gc-refund')).toBe(2000);

    const refunds = await squareRequests('/v2/refunds');
    expect(
      refunds.map((r) => [r.body['payment_id'], (r.body['amount_money'] as { amount: number }).amount])
    ).toEqual([
      [registration.squarePaymentId, 2770],
      [registration.squareGiftCardPaymentId, 2000],
    ]);

    const stored = await getFirestoreDoc('registrations', registration.id);
    expect(stored?.['status']).toBe('refunded');
  });

  // Last in the file: the wrong numbers it counts stay counted for the hour
  // (afterAll clears them with the rest of Firestore).
  it('refuses a visitor who has typed too many numbers that match no card', async () => {
    await seedGiftCard({ nonce: 'gftok:real', id: 'gc-real', balanceCents: 4000 });
    // As Google's front end does in production: it appends the address it
    // received the connection from. The emulator sends none of its own.
    const preview = (giftCardNonce: string, ip = '192.0.2.50') =>
      callFunction<PreviewGiftCardForClassRequest, PreviewGiftCardForClassResponse>({
        functionName: 'giftCards/previewGiftCardForClass',
        data: { giftCardNonce, classId: POTTERY_CLASS_ID, quantity: 1 },
        headers: { 'x-forwarded-for': ip },
      });

    for (let i = 0; i < 5; i++) {
      const wrong = await preview(`gftok:wrong-${i}`);
      expect(JSON.stringify(wrong.raw)).toContain("couldn't find that gift card");
    }

    // Even a real card is refused now, and Square is not asked.
    const before = (await squareRequests('/v2/gift-cards')).length;
    const locked = await preview('gftok:real');
    expect(JSON.stringify(locked.raw)).toContain("Too many gift card numbers didn't match");
    expect((await squareRequests('/v2/gift-cards')).length).toBe(before);

    // Another visitor is not affected.
    const other = await preview('gftok:real', '192.0.2.51');
    expect(other.status).toBe(200);
    expect(other.data?.balanceCents).toBe(4000);
  });
});

