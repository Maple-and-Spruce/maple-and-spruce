/**
 * Integration tests for createRegistrationCheckoutLink — the Square-hosted
 * checkout fallback (used when the embedded Web Payments SDK can't initialize,
 * e.g. Safari ITP).
 *
 * Exercises the real function against the Firestore emulator + the Square mock
 * server (POST /v2/online-checkout/payment-links). Verifies that it:
 *  - reserves a `pending`, source:'web' registration with the correct pricing,
 *  - returns a Square-hosted checkout URL + the registration id + confirmation #,
 *  - honors class capacity (rejects when full — the shared reservation guard),
 *  - validates input.
 *
 * The pending -> confirmed reconciliation (processPosSale on the payment
 * webhook) is covered by that function's unit tests; the end-to-end redirect
 * flow is covered by the PR-2 e2e.
 */
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  PUBLISHED_CLASS,
} from '@maple/firebase/integration-test-utils';
import type {
  CreateRegistrationCheckoutLinkRequest,
  CreateRegistrationCheckoutLinkResponse,
} from '@maple/ts/firebase/api-types';

const CLASS_ID = 'test-checkout-link-class';

const validRequest = (): CreateRegistrationCheckoutLinkRequest => ({
  classId: CLASS_ID,
  customerEmail: 'buyer@test.com',
  customerName: 'Casey Buyer',
  quantity: 1,
});

describe('createRegistrationCheckoutLink', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await setFirestoreDoc('classes', CLASS_ID, { ...PUBLISHED_CLASS });
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  it('reserves a pending registration and returns a hosted checkout URL', async () => {
    const result = await callFunction<
      CreateRegistrationCheckoutLinkRequest,
      CreateRegistrationCheckoutLinkResponse
    >({
      functionName: 'createRegistrationCheckoutLink',
      data: validRequest(),
    });

    expect(result.status).toBe(200);
    expect(result.data?.checkoutUrl).toContain('square.link');
    expect(result.data?.confirmationNumber).toMatch(/^MS-/);
    const registrationId = result.data?.registrationId;
    expect(registrationId).toBeTruthy();

    // The spot is held as a pending, source:'web' registration priced with tax.
    const reg = await getFirestoreDoc('registrations', registrationId as string);
    expect(reg).toBeTruthy();
    expect(reg?.status).toBe('pending');
    expect(reg?.source).toBe('web');
    expect(reg?.classId).toBe(CLASS_ID);
    expect(reg?.subtotalCents).toBe(PUBLISHED_CLASS.priceCents);
    // 4500 + 6% WV tax = 4770.
    expect(reg?.pricePaidCents).toBe(4770);
  });

  it('rejects when the class is already full (shared capacity guard)', async () => {
    // Capacity 1, already taken by a confirmed registration.
    await setFirestoreDoc('classes', CLASS_ID, {
      ...PUBLISHED_CLASS,
      capacity: 1,
    });
    await setFirestoreDoc('registrations', 'existing-confirmed', {
      classId: CLASS_ID,
      customerEmail: 'taken@test.com',
      customerName: 'Already Registered',
      quantity: 1,
      status: 'confirmed',
      source: 'web',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await callFunction<CreateRegistrationCheckoutLinkRequest>({
      functionName: 'createRegistrationCheckoutLink',
      data: validRequest(),
    });

    expect(result.status).not.toBe(200);
  });

  it('rejects invalid input (missing email)', async () => {
    const result = await callFunction<
      Partial<CreateRegistrationCheckoutLinkRequest>
    >({
      functionName: 'createRegistrationCheckoutLink',
      data: { classId: CLASS_ID, customerName: 'No Email', quantity: 1 },
    });

    expect(result.status).not.toBe(200);
  });
});
