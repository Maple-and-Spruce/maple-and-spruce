/**
 * Integration tests for the self-service card-on-file update flow, end-to-end
 * against the Firebase emulator + Square mock server:
 *
 *   seed installment registration (old card) + a due scheduled charge
 *     → startMusicTogetherManageSession(access token)  → session token
 *     → updateMusicTogetherPaymentMethod(session, new nonce)
 *         → MT Square mock vaults a NEW card + DISABLES the old one
 *         → registration.squareCardId repointed to the new card (customer kept)
 *     → triggerMusicTogetherInstallments (admin) charges the now-due installment
 *         → the payment targets the NEW card, proving the retarget is real.
 *
 * Requires the maple-core + maple-square codebases built into the emulator and
 * the Square mock server on 9997(+offset). The harness
 * (`tools/run-integration-tests.sh music-together`) sets this up.
 */
import { createHash } from 'crypto';
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  EMULATOR_CONFIG,
  ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  StartMusicTogetherManageSessionRequest,
  StartMusicTogetherManageSessionResponse,
  UpdateMusicTogetherPaymentMethodRequest,
  UpdateMusicTogetherPaymentMethodResponse,
  ChargeMusicTogetherInstallmentsRequest,
  MusicTogetherInstallmentChargeResult,
} from '@maple/ts/firebase/api-types';

const squareMockUrl = EMULATOR_CONFIG.squareMockServerUrl;

interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

async function resetSquareMock(): Promise<void> {
  const res = await fetch(`${squareMockUrl}/_mock/reset`, { method: 'POST' });
  if (!res.ok) throw new Error(`Square mock reset failed: ${res.status}`);
}

async function getSquareRequests(
  pathPrefix?: string
): Promise<RecordedRequest[]> {
  const res = await fetch(`${squareMockUrl}/_mock/requests`);
  if (!res.ok) throw new Error(`Square mock requests failed: ${res.status}`);
  const body = (await res.json()) as { requests: RecordedRequest[] };
  const requests = body.requests ?? [];
  return pathPrefix
    ? requests.filter((r) => r.path.startsWith(pathPrefix))
    : requests;
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

const RAW_ACCESS_TOKEN = 'raw-access-token-abc123';
const OLD_CARD_ID = 'ccof:old-card';
const past = new Date(Date.now() - 86_400_000);
const future = new Date(Date.now() + 30 * 60 * 1000);

let sessionToken = '';

describe('updateMusicTogetherPaymentMethod — end-to-end card replacement', () => {
  let admin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });

    await setFirestoreDoc('musicTogetherSections', 'sec-1', {
      name: 'Fall Babies',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await setFirestoreDoc('musicTogetherRegistrations', 'reg-upd', {
      sectionId: 'sec-1',
      parentNames: ['Ada Lovelace'],
      adultFirstName: 'Ada',
      adultLastName: 'Lovelace',
      children: [{ name: 'Sky', dob: new Date('2023-04-01') }],
      email: 'update-card@test.com',
      phone: '304-555-1212',
      address: 'somewhere',
      paymentPlan: 'installments',
      policiesAcceptedAt: new Date(),
      cardOnFileAuthAt: new Date(),
      pricePaidCents: 9500,
      squareCustomerId: 'cust-old',
      squareCardId: OLD_CARD_ID,
      status: 'confirmed',
      scheduledChargeCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // A due installment so we can prove the charge job targets the new card.
    await setFirestoreDoc('musicTogetherScheduledCharges', 'chg-upd', {
      registrationId: 'reg-upd',
      sectionId: 'sec-1',
      installmentNumber: 2,
      amountCents: 9500,
      dueAt: past,
      status: 'scheduled',
      idempotencyKey: 'mt-charge-updtest',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed the emailed magic-link access token (only its hash is stored).
    await setFirestoreDoc('musicTogetherAccessTokens', 'tok-1', {
      tokenHash: hashToken(RAW_ACCESS_TOKEN),
      registrationId: 'reg-upd',
      expiresAt: future,
      usedAt: null,
      createdAt: new Date(),
    });

    await resetSquareMock();
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('exchanges the magic-link token for a session + manage view', async () => {
    const result = await callFunction<
      StartMusicTogetherManageSessionRequest,
      StartMusicTogetherManageSessionResponse
    >({
      functionName: 'startMusicTogetherManageSession',
      data: { token: RAW_ACCESS_TOKEN },
    });

    expect(result.status).toBe(200);
    expect(result.data?.sessionToken).toBeTruthy();
    expect(result.data?.registration.registrationId).toBe('reg-upd');
    expect(result.data?.registration.sectionName).toBe('Fall Babies');
    expect(result.data?.registration.nextInstallment?.amountLabel).toBe(
      '$95.00'
    );
    sessionToken = result.data!.sessionToken;
  });

  it('rejects reusing the now-consumed magic-link token', async () => {
    const result = await callFunction<
      StartMusicTogetherManageSessionRequest,
      StartMusicTogetherManageSessionResponse
    >({
      functionName: 'startMusicTogetherManageSession',
      data: { token: RAW_ACCESS_TOKEN },
    });
    expect(result.status).not.toBe(200);
  });

  it('vaults a new card, repoints the registration, and disables the old card', async () => {
    const result = await callFunction<
      UpdateMusicTogetherPaymentMethodRequest,
      UpdateMusicTogetherPaymentMethodResponse
    >({
      functionName: 'updateMusicTogetherPaymentMethod',
      data: { sessionToken, paymentNonce: 'cnon:new-card' },
    });

    expect(result.status).toBe(200);
    expect(result.data?.cardLast4).toBe('1111');

    // Registration repointed to a NEW card; customer id preserved.
    const reg = await getFirestoreDoc('musicTogetherRegistrations', 'reg-upd');
    expect(reg?.squareCardId).not.toBe(OLD_CARD_ID);
    expect(String(reg?.squareCardId)).toMatch(/^ccof:mock-card-/);
    expect(reg?.squareCustomerId).toBe('cust-old');

    // MT Square mock saw a card create AND a disable of the old card. The card
    // id contains a colon; the SDK may URL-encode it, so match tolerantly.
    const cardReqs = await getSquareRequests('/v2/cards');
    expect(cardReqs.some((r) => r.path === '/v2/cards')).toBe(true);
    const oldCardEncoded = encodeURIComponent(OLD_CARD_ID);
    expect(
      cardReqs.some(
        (r) =>
          /\/disable$/.test(r.path) &&
          (r.path.includes(OLD_CARD_ID) || r.path.includes(oldCardEncoded))
      )
    ).toBe(true);
  });

  it('rejects an unknown session token', async () => {
    const result = await callFunction<
      UpdateMusicTogetherPaymentMethodRequest,
      UpdateMusicTogetherPaymentMethodResponse
    >({
      functionName: 'updateMusicTogetherPaymentMethod',
      data: { sessionToken: 'not-a-real-session', paymentNonce: 'cnon:x' },
    });
    expect(result.status).not.toBe(200);
  });

  it('charges the DUE installment against the NEW card (retarget is real)', async () => {
    const reg = await getFirestoreDoc('musicTogetherRegistrations', 'reg-upd');
    const newCardId = String(reg?.squareCardId);

    const result = await callFunction<
      ChargeMusicTogetherInstallmentsRequest,
      MusicTogetherInstallmentChargeResult
    >({
      functionName: 'triggerMusicTogetherInstallments',
      data: {},
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.charged).toBe(1);

    // The last payment the charge job sent used the new card as its source.
    const payments = await getSquareRequests('/v2/payments');
    const lastPayment = payments[payments.length - 1];
    const body = lastPayment.body as Record<string, unknown>;
    expect(body['source_id'] ?? body['sourceId']).toBe(newCardId);

    const charge = await getFirestoreDoc(
      'musicTogetherScheduledCharges',
      'chg-upd'
    );
    expect(charge?.status).toBe('paid');
  });
});
