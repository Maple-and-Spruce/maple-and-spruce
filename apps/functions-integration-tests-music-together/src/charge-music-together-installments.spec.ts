/**
 * Integration tests for the Week-5 installment charge job, driven through the
 * admin-callable trigger `triggerMusicTogetherInstallments` (the onSchedule
 * trigger isn't HTTP-reachable in the emulator). Exercises the dry run, a real
 * stored-card charge via the Square mock, the lease/at-most-once guarantee, and
 * failure handling when a registration has no card on file.
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
  ChargeMusicTogetherInstallmentsRequest,
  MusicTogetherInstallmentChargeResult,
} from '@maple/ts/firebase/api-types';

const past = new Date(Date.now() - 86_400_000);

function confirmedReg(overrides: Record<string, unknown> = {}) {
  return {
    sectionId: 'sec-1',
    parentNames: ['Jamie Rivera'],
    children: [{ name: 'Sky', dob: new Date('2023-04-01') }],
    email: 'installments@test.com',
    phone: '304-555-1212',
    address: 'somewhere',
    paymentPlan: 'installments',
    policiesAcceptedAt: new Date(),
    cardOnFileAuthAt: new Date(),
    pricePaidCents: 13200,
    squareCustomerId: 'mock-customer-seed',
    squareCardId: 'ccof:mock-card-seed',
    status: 'confirmed',
    scheduledChargeCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function dueCharge(overrides: Record<string, unknown> = {}) {
  return {
    registrationId: 'reg-ok',
    sectionId: 'sec-1',
    installmentNumber: 2,
    amountCents: 13200,
    dueAt: past,
    status: 'scheduled',
    idempotencyKey: 'mt-charge-seed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function seedAdmin(): Promise<TestUser> {
  const admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
  await setFirestoreDoc('admins', admin.uid, {
    userId: admin.uid,
    email: admin.email,
  });
  return admin;
}

describe('triggerMusicTogetherInstallments — due charge', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await seedAdmin();
    nonAdmin = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );
    await setFirestoreDoc('musicTogetherRegistrations', 'reg-ok', confirmedReg());
    await setFirestoreDoc('musicTogetherScheduledCharges', 'chg-due', dueCharge());
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('rejects a non-admin caller', async () => {
    const result = await callFunction<ChargeMusicTogetherInstallmentsRequest>({
      functionName: 'triggerMusicTogetherInstallments',
      data: {},
      idToken: nonAdmin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('dry run reports the due charge without charging', async () => {
    const result = await callFunction<
      ChargeMusicTogetherInstallmentsRequest,
      MusicTogetherInstallmentChargeResult
    >({
      functionName: 'triggerMusicTogetherInstallments',
      data: { dryRun: true },
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.dryRun).toBe(true);
    expect(result.data?.due).toBeGreaterThanOrEqual(1);
    expect(result.data?.charged).toBe(0);
    expect(
      result.data?.wouldCharge?.some((c) => c.chargeId === 'chg-due')
    ).toBe(true);

    // still scheduled — nothing was charged
    const charge = await getFirestoreDoc('musicTogetherScheduledCharges', 'chg-due');
    expect(charge?.status).toBe('scheduled');
  });

  it('charges the stored card and marks the charge paid', async () => {
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
    expect(result.data?.failed).toBe(0);

    const charge = await getFirestoreDoc('musicTogetherScheduledCharges', 'chg-due');
    expect(charge?.status).toBe('paid');
    expect(String(charge?.squarePaymentId)).toMatch(/^mock-payment-/);
  });

  it('is at-most-once — a second run finds nothing due (lease guard)', async () => {
    const result = await callFunction<
      ChargeMusicTogetherInstallmentsRequest,
      MusicTogetherInstallmentChargeResult
    >({
      functionName: 'triggerMusicTogetherInstallments',
      data: {},
      idToken: admin.idToken,
    });
    expect(result.status).toBe(200);
    expect(result.data?.due).toBe(0);
    expect(result.data?.charged).toBe(0);
  });
});

describe('triggerMusicTogetherInstallments — failure handling', () => {
  let admin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await seedAdmin();
    // A due charge whose registration has no card on file → not chargeable.
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'reg-nocard',
      confirmedReg({ squareCardId: undefined, squareCustomerId: undefined })
    );
    await setFirestoreDoc(
      'musicTogetherScheduledCharges',
      'chg-nocard',
      dueCharge({ registrationId: 'reg-nocard', idempotencyKey: 'mt-charge-nocard' })
    );
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('marks an uncharageable charge failed (loud, not silently skipped)', async () => {
    const result = await callFunction<
      ChargeMusicTogetherInstallmentsRequest,
      MusicTogetherInstallmentChargeResult
    >({
      functionName: 'triggerMusicTogetherInstallments',
      data: {},
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.failed).toBe(1);
    expect(result.data?.charged).toBe(0);

    const charge = await getFirestoreDoc(
      'musicTogetherScheduledCharges',
      'chg-nocard'
    );
    expect(charge?.status).toBe('failed');
    expect(charge?.lastError).toBeDefined();
  });
});
