/**
 * Integration tests for cancelMusicTogetherRegistration (admin).
 *
 * Exercises the refund policy (full minus the $25 fee before the first class,
 * non-refundable after — via the mock Square /v2/refunds), the cancel-guard
 * (scheduled charges flipped to cancelled), and the auth/domain guards.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  CancelMusicTogetherRegistrationRequest,
  CancelMusicTogetherRegistrationResponse,
} from '@maple/ts/firebase/api-types';

const future = new Date(Date.now() + 7 * 86_400_000);
const pastDate = new Date(Date.now() - 7 * 86_400_000);

function reg(overrides: Record<string, unknown> = {}) {
  return {
    sectionId: 'sec-future',
    parentNames: ['Jamie Rivera'],
    children: [{ name: 'Sky', dob: new Date('2023-04-01') }],
    email: 'cancel@test.com',
    phone: '304-555-1212',
    address: 'somewhere',
    paymentPlan: 'installments',
    policiesAcceptedAt: new Date(),
    pricePaidCents: 13200,
    squarePaymentId: 'mock-payment-cancel',
    squareCustomerId: 'mock-customer-cancel',
    squareCardId: 'ccof:mock-card-cancel',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('cancelMusicTogetherRegistration', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });

    // Sections: one whose first class is in the future (refundable), one past.
    await setFirestoreDoc('musicTogetherSections', 'sec-future', {
      name: 'Future Section',
      sessions: [{ dateTime: future }],
      capacityFamilies: 8,
      priceFullCents: 25200,
      visible: true,
      enrollmentActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setFirestoreDoc('musicTogetherSections', 'sec-past', {
      name: 'Started Section',
      sessions: [{ dateTime: pastDate }],
      capacityFamilies: 8,
      priceFullCents: 25200,
      visible: true,
      enrollmentActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('rejects a non-admin caller', async () => {
    await setFirestoreDoc('musicTogetherRegistrations', 'reg-auth', reg());
    const result = await callFunction<CancelMusicTogetherRegistrationRequest>({
      functionName: 'cancelMusicTogetherRegistration',
      data: { registrationId: 'reg-auth' },
      idToken: nonAdmin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('before first class: refunds paid amount minus $25, cancels scheduled charges', async () => {
    await setFirestoreDoc('musicTogetherRegistrations', 'reg-refund', reg());
    await setFirestoreDoc('musicTogetherScheduledCharges', 'chg-refund', {
      registrationId: 'reg-refund',
      sectionId: 'sec-future',
      installmentNumber: 2,
      amountCents: 13200,
      dueAt: future,
      status: 'scheduled',
      idempotencyKey: 'mt-charge-refund',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await callFunction<
      CancelMusicTogetherRegistrationRequest,
      CancelMusicTogetherRegistrationResponse
    >({
      functionName: 'cancelMusicTogetherRegistration',
      data: { registrationId: 'reg-refund' },
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('refunded');
    expect(result.data?.refundCents).toBe(13200 - 2500);
    expect(String(result.data?.refundId)).toMatch(/^mock-refund-/);
    expect(result.data?.cancelledChargeCount).toBe(1);

    // cancel-guard: the scheduled charge is now cancelled
    const charge = await getFirestoreDoc(
      'musicTogetherScheduledCharges',
      'chg-refund'
    );
    expect(charge?.status).toBe('cancelled');
  });

  it('on/after first class: non-refundable, still cancels', async () => {
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-started',
      reg({ sectionId: 'sec-past', email: 'started@test.com' })
    );

    const result = await callFunction<
      CancelMusicTogetherRegistrationRequest,
      CancelMusicTogetherRegistrationResponse
    >({
      functionName: 'cancelMusicTogetherRegistration',
      data: { registrationId: 'reg-started' },
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('cancelled');
    expect(result.data?.refundCents).toBe(0);
    expect(result.data?.refundId).toBeUndefined();
  });

  it('rejects an already-cancelled registration', async () => {
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-done',
      reg({ status: 'cancelled' })
    );
    const result = await callFunction<CancelMusicTogetherRegistrationRequest>({
      functionName: 'cancelMusicTogetherRegistration',
      data: { registrationId: 'reg-done' },
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('admin partial refund: refunds the chosen amount, cancels scheduled charges', async () => {
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-partial',
      reg({ email: 'partial@test.com' })
    );
    await setFirestoreDoc('musicTogetherScheduledCharges', 'chg-partial', {
      registrationId: 'reg-partial',
      sectionId: 'sec-future',
      installmentNumber: 2,
      amountCents: 12000,
      dueAt: future,
      status: 'scheduled',
      idempotencyKey: 'mt-charge-partial',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await callFunction<
      CancelMusicTogetherRegistrationRequest,
      CancelMusicTogetherRegistrationResponse
    >({
      functionName: 'cancelMusicTogetherRegistration',
      data: { registrationId: 'reg-partial', refundCents: 5000 },
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('refunded');
    expect(result.data?.refundCents).toBe(5000);
    expect(String(result.data?.refundId)).toMatch(/^mock-refund-/);
    expect(result.data?.cancelledChargeCount).toBe(1);

    const charge = await getFirestoreDoc(
      'musicTogetherScheduledCharges',
      'chg-partial'
    );
    expect(charge?.status).toBe('cancelled');
    const updated = await getFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-partial'
    );
    expect(updated?.status).toBe('refunded');
  });

  it('admin full refund overrides the $25 policy fee', async () => {
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-full',
      reg({ email: 'full@test.com' })
    );

    const result = await callFunction<
      CancelMusicTogetherRegistrationRequest,
      CancelMusicTogetherRegistrationResponse
    >({
      functionName: 'cancelMusicTogetherRegistration',
      data: { registrationId: 'reg-full', refundCents: 13200 },
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('refunded');
    expect(result.data?.refundCents).toBe(13200);
  });

  it('installment-aware: a partial refund spans a paid installment payment', async () => {
    // Registration payment (13200) + a paid installment 2 (12000) captured.
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-span',
      reg({ email: 'span@test.com' })
    );
    await setFirestoreDoc('musicTogetherScheduledCharges', 'chg-span-paid', {
      registrationId: 'reg-span',
      sectionId: 'sec-future',
      installmentNumber: 2,
      amountCents: 12000,
      dueAt: pastDate,
      status: 'paid',
      squarePaymentId: 'mock-payment-installment2',
      idempotencyKey: 'mt-charge-span',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await callFunction<
      CancelMusicTogetherRegistrationRequest,
      CancelMusicTogetherRegistrationResponse
    >({
      functionName: 'cancelMusicTogetherRegistration',
      // 20000 = 13200 (reg payment) + 6800 (installment 2)
      data: { registrationId: 'reg-span', refundCents: 20000 },
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('refunded');
    expect(result.data?.refundCents).toBe(20000);
    // Two refunds issued — one per captured payment.
    expect(result.data?.refundIds).toHaveLength(2);
  });

  it('rejects an over-refund above the captured amount (no state change)', async () => {
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-over',
      reg({ email: 'over@test.com' })
    );

    const result = await callFunction<CancelMusicTogetherRegistrationRequest>({
      functionName: 'cancelMusicTogetherRegistration',
      data: { registrationId: 'reg-over', refundCents: 13201 },
      idToken: admin.idToken,
    });

    expect(result.status).not.toBe(200);
    // Registration is untouched — still confirmed.
    const untouched = await getFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-over'
    );
    expect(untouched?.status).toBe('confirmed');
  });
});
