/**
 * Integration tests for getRegistrationStatus — the public lookup the widget
 * uses on the hosted-checkout return (?reg=<id>) to verify a payment landed
 * before showing a confirmation (rather than trusting the query param).
 */
import {
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
  PUBLISHED_CLASS,
} from '@maple/firebase/integration-test-utils';
import type {
  GetRegistrationStatusRequest,
  GetRegistrationStatusResponse,
} from '@maple/ts/firebase/api-types';

const CLASS_ID = 'test-status-class';

function seedReg(id: string, overrides: Record<string, unknown>) {
  return setFirestoreDoc('registrations', id, {
    classId: CLASS_ID,
    customerEmail: 'buyer@test.com',
    customerName: 'Casey Buyer',
    quantity: 1,
    pricePaidCents: 4770,
    subtotalCents: 4500,
    taxAmountCents: 270,
    taxRatePercent: 6,
    confirmationNumber: 'MS-TEST01',
    source: 'web',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

describe('getRegistrationStatus', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
    await setFirestoreDoc('classes', CLASS_ID, { ...PUBLISHED_CLASS });
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  it('returns confirmation details for a confirmed registration', async () => {
    await seedReg('reg-confirmed', { status: 'confirmed' });

    const result = await callFunction<
      GetRegistrationStatusRequest,
      GetRegistrationStatusResponse
    >({
      functionName: 'getRegistrationStatus',
      data: { registrationId: 'reg-confirmed' },
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('confirmed');
    expect(result.data?.confirmation).toMatchObject({
      confirmationNumber: 'MS-TEST01',
      customerName: 'Casey Buyer',
      customerEmail: 'buyer@test.com',
      quantity: 1,
      pricePaidCents: 4770,
    });
    expect(result.data?.confirmation?.className).toBe(PUBLISHED_CLASS.name);
  });

  it('returns status only (no PII) for a pending registration', async () => {
    await seedReg('reg-pending', { status: 'pending' });

    const result = await callFunction<
      GetRegistrationStatusRequest,
      GetRegistrationStatusResponse
    >({
      functionName: 'getRegistrationStatus',
      data: { registrationId: 'reg-pending' },
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('pending');
    expect(result.data?.confirmation).toBeUndefined();
  });

  it('returns not-found for an unknown registration id', async () => {
    const result = await callFunction<
      GetRegistrationStatusRequest,
      GetRegistrationStatusResponse
    >({
      functionName: 'getRegistrationStatus',
      data: { registrationId: 'does-not-exist' },
    });

    expect(result.status).toBe(200);
    expect(result.data?.status).toBe('not-found');
  });
});
