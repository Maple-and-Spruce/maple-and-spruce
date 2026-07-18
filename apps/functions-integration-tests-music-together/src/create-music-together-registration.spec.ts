/**
 * Integration tests for createMusicTogetherRegistration.
 *
 * Runs the real function in the Firebase emulator; MT Square customer/card/
 * payment calls are intercepted by the mock server via SQUARE_BASE_URL (the
 * base-URL override applies to the MT Square client too). Exercises full-pay
 * and the installments flow (customer upsert → card vault → stored-card charge
 * → materialized scheduled charges), the 8-family cap, and validation guards.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  listFirestoreDocs,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type {
  CreateMusicTogetherRegistrationRequest,
  CreateMusicTogetherRegistrationResponse,
} from '@maple/ts/firebase/api-types';

const week1 = new Date(Date.now() + 7 * 86_400_000);
const week5 = new Date(Date.now() + 35 * 86_400_000);

function sectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Spring MT — Tuesdays',
    sessions: [{ dateTime: week1 }],
    capacityFamilies: 8,
    priceFullCents: 25200,
    installmentPlan: [
      { amountCents: 13200, dueAt: week1 },
      { amountCents: 13200, dueAt: week5 },
    ],
    visible: true,
    enrollmentActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function family(
  overrides: Partial<CreateMusicTogetherRegistrationRequest> = {}
): CreateMusicTogetherRegistrationRequest {
  return {
    sectionId: 'sec-open',
    adultFirstName: 'Jamie',
    adultLastName: 'Rivera',
    parentNames: ['Jamie Rivera'],
    children: [{ name: 'Sky', dob: '2023-04-01' }],
    email: 'jamie@test.com',
    phone: '304-555-1212',
    address: '123 Spruce St, Morgantown, WV',
    paymentPlan: 'full',
    policiesAccepted: true,
    privacyConsent: true,
    paymentNonce: 'cnon:card-nonce-ok',
    ...overrides,
  };
}

describe('createMusicTogetherRegistration', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    await setFirestoreDoc('musicTogetherSections', 'sec-open', sectionDoc());
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-draft',
      sectionDoc({ enrollmentActive: false })
    );
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-full',
      sectionDoc({ capacityFamilies: 1 })
    );
    // Fill sec-full with one confirmed family so the cap is reached.
    await setFirestoreDoc('musicTogetherRegistrations', 'existing-full', {
      sectionId: 'sec-full',
      parentNames: ['Existing Family'],
      children: [{ name: 'Kid', dob: new Date('2023-01-01') }],
      email: 'existing@test.com',
      phone: '304-555-0000',
      address: 'somewhere',
      paymentPlan: 'full',
      policiesAcceptedAt: new Date(),
      pricePaidCents: 25200,
      status: 'confirmed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('full pay: charges once, confirms, persists the registration + confirmation email', async () => {
    const result = await callFunction<
      CreateMusicTogetherRegistrationRequest,
      CreateMusicTogetherRegistrationResponse
    >({ functionName: 'createMusicTogetherRegistration', data: family() });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('confirmed');
    expect(result.data?.amountChargedCents).toBe(25200);
    expect(result.data?.scheduledChargeCount).toBe(0);

    const reg = await getFirestoreDoc(
      'musicTogetherRegistrations',
      result.data!.registrationId
    );
    expect(reg?.status).toBe('confirmed');
    expect(String(reg?.squarePaymentId)).toMatch(/^mock-payment-/);

    const mail = await listFirestoreDocs('mail');
    expect(
      mail.some((m) => (m.data as { to?: string }).to === 'jamie@test.com')
    ).toBe(true);
  });

  it('installments: vaults a card, charges installment 1, materializes the rest as scheduled charges', async () => {
    const result = await callFunction<
      CreateMusicTogetherRegistrationRequest,
      CreateMusicTogetherRegistrationResponse
    >({
      functionName: 'createMusicTogetherRegistration',
      data: family({
        email: 'installments@test.com',
        paymentPlan: 'installments',
        cardOnFileAuth: true,
        cardVerificationToken: 'verf:store-token',
      }),
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('confirmed');
    expect(result.data?.amountChargedCents).toBe(13200); // installment 1
    expect(result.data?.cardLast4).toBe('1111'); // from the mock card
    expect(result.data?.scheduledChargeCount).toBe(1); // installment 2

    const reg = await getFirestoreDoc(
      'musicTogetherRegistrations',
      result.data!.registrationId
    );
    expect(String(reg?.squareCardId)).toMatch(/^ccof:mock-card-/);
    expect(String(reg?.squareCustomerId)).toMatch(/^mock-customer-/);

    const charges = (await listFirestoreDocs('musicTogetherScheduledCharges'))
      .map((c) => c.data as Record<string, unknown>)
      .filter((c) => c.registrationId === result.data!.registrationId);
    expect(charges).toHaveLength(1);
    expect(charges[0].status).toBe('scheduled');
    expect(charges[0].amountCents).toBe(13200);
    expect(String(charges[0].idempotencyKey)).toMatch(/^mt-charge-/);
  });

  it('installments: an email Square Customers Search rejects still succeeds via the create fallback', async () => {
    // Real Square's Customers Search rejects reserved-TLD emails (the mock now
    // mirrors this). upsertByEmail must treat that search failure as "not
    // found" and create the customer anyway (#634) — otherwise the whole
    // installment registration fails. This is the class of bug the real-Square
    // e2e caught but the mock previously hid.
    const result = await callFunction<
      CreateMusicTogetherRegistrationRequest,
      CreateMusicTogetherRegistrationResponse
    >({
      functionName: 'createMusicTogetherRegistration',
      data: family({
        email: 'search-rejected@maplespruce.test',
        paymentPlan: 'installments',
        cardOnFileAuth: true,
        cardVerificationToken: 'verf:store-token',
      }),
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('confirmed');

    const reg = await getFirestoreDoc(
      'musicTogetherRegistrations',
      result.data!.registrationId
    );
    // The customer was created despite the search rejection.
    expect(String(reg?.squareCustomerId)).toMatch(/^mock-customer-/);
    expect(String(reg?.squareCardId)).toMatch(/^ccof:mock-card-/);
  });

  it('full pay: charges the sibling-discounted total for a 2-child family', async () => {
    const result = await callFunction<
      CreateMusicTogetherRegistrationRequest,
      CreateMusicTogetherRegistrationResponse
    >({
      functionName: 'createMusicTogetherRegistration',
      data: family({
        email: 'twokids@test.com',
        children: [
          { name: 'Sky', dob: '2023-04-01' },
          { name: 'River', dob: '2024-05-02' },
        ],
      }),
    });

    expect(result.status).toBe(200);
    // $252 base × 1.5 (first child full, 50% off the 2nd) = $378.
    expect(result.data?.amountChargedCents).toBe(37800);
    expect(result.data?.scheduledChargeCount).toBe(0);

    const reg = await getFirestoreDoc(
      'musicTogetherRegistrations',
      result.data!.registrationId
    );
    expect(reg?.pricePaidCents).toBe(37800);
  });

  it('installments: discounts installment 1 AND the scheduled charge for a 3-child family', async () => {
    const result = await callFunction<
      CreateMusicTogetherRegistrationRequest,
      CreateMusicTogetherRegistrationResponse
    >({
      functionName: 'createMusicTogetherRegistration',
      data: family({
        email: 'threekids@test.com',
        paymentPlan: 'installments',
        cardOnFileAuth: true,
        cardVerificationToken: 'verf:store-token',
        children: [
          { name: 'Sky', dob: '2023-04-01' },
          { name: 'River', dob: '2024-05-02' },
          { name: 'Wren', dob: '2025-06-03' },
        ],
      }),
    });

    expect(result.status).toBe(200);
    // $132 base × 2.0 (first child full, 50% off the 2nd & 3rd) = $264 each.
    expect(result.data?.amountChargedCents).toBe(26400); // installment 1
    expect(result.data?.scheduledChargeCount).toBe(1);

    const charges = (await listFirestoreDocs('musicTogetherScheduledCharges'))
      .map((c) => c.data as Record<string, unknown>)
      .filter((c) => c.registrationId === result.data!.registrationId);
    expect(charges).toHaveLength(1);
    // The scheduled Week-5 charge is discounted too.
    expect(charges[0].amountCents).toBe(26400);
    expect(charges[0].status).toBe('scheduled');
  });

  it('rejects a section that is not open', async () => {
    const result = await callFunction<CreateMusicTogetherRegistrationRequest>({
      functionName: 'createMusicTogetherRegistration',
      data: family({ sectionId: 'sec-draft', email: 'draft@test.com' }),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects when the section is at its family cap', async () => {
    const result = await callFunction<CreateMusicTogetherRegistrationRequest>({
      functionName: 'createMusicTogetherRegistration',
      data: family({ sectionId: 'sec-full', email: 'overflow@test.com' }),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects installments without card-on-file authorization', async () => {
    const result = await callFunction<CreateMusicTogetherRegistrationRequest>({
      functionName: 'createMusicTogetherRegistration',
      data: family({
        email: 'noauth@test.com',
        paymentPlan: 'installments',
        cardOnFileAuth: false,
      }),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects installments without a card verification token (real Square needs it to vault a card)', async () => {
    const result = await callFunction<CreateMusicTogetherRegistrationRequest>({
      functionName: 'createMusicTogetherRegistration',
      data: family({
        email: 'noverify@test.com',
        paymentPlan: 'installments',
        cardOnFileAuth: true,
        // cardVerificationToken deliberately omitted.
      }),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects when policies are not accepted', async () => {
    const result = await callFunction<CreateMusicTogetherRegistrationRequest>({
      functionName: 'createMusicTogetherRegistration',
      data: family({ email: 'nopolicy@test.com', policiesAccepted: false }),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects when the privacy notice is not accepted', async () => {
    const result = await callFunction<CreateMusicTogetherRegistrationRequest>({
      functionName: 'createMusicTogetherRegistration',
      data: family({ email: 'noprivacy@test.com', privacyConsent: false }),
    });
    expect(result.status).not.toBe(200);
  });
});
