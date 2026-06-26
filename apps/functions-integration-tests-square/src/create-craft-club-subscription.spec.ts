/**
 * Integration tests for createCraftClubSubscription Cloud Function.
 *
 * Runs in the Firebase emulator against real Firestore; Square customer/card/
 * subscription calls are intercepted by the mock server via SQUARE_BASE_URL.
 * Exercises the approved-only gate and the customer → card → subscription →
 * member-state-mirror flow.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type {
  CreateCraftClubSubscriptionRequest,
  CreateCraftClubSubscriptionResponse,
} from '@maple/ts/firebase/api-types';

const APPROVED_EMAIL = 'approved-member@test.com';
const ACTIVE_EMAIL = 'active-member@test.com';

function memberDoc(overrides: Record<string, unknown>) {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('createCraftClubSubscription', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    await setFirestoreDoc(
      'craftClubMembers',
      'approved-1',
      memberDoc({ email: APPROVED_EMAIL, status: 'approved' })
    );
    await setFirestoreDoc(
      'craftClubMembers',
      'active-1',
      memberDoc({
        email: ACTIVE_EMAIL,
        status: 'active',
        squareSubscriptionId: 'existing-sub',
      })
    );
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('subscribes an approved member and mirrors Square state', async () => {
    const result = await callFunction<
      CreateCraftClubSubscriptionRequest,
      CreateCraftClubSubscriptionResponse
    >({
      functionName: 'createCraftClubSubscription',
      data: {
        email: APPROVED_EMAIL,
        name: 'Approved Member',
        paymentNonce: 'cnon:card-nonce-ok',
      },
    });

    expect(result.status).toBe(200);
    expect(result.data?.member.status).toBe('active');
    expect(result.data?.member.squareSubscriptionId).toBeDefined();
    expect(result.data?.member.squareCustomerId).toBeDefined();
    expect(result.data?.member.squareCardId).toBeDefined();
    expect(result.data?.cardLast4).toBe('1111');
  });

  it('rejects an email that is not on the approved list', async () => {
    const result = await callFunction<
      CreateCraftClubSubscriptionRequest,
      CreateCraftClubSubscriptionResponse
    >({
      functionName: 'createCraftClubSubscription',
      data: {
        email: 'stranger@test.com',
        name: 'Stranger',
        paymentNonce: 'cnon:card-nonce-ok',
      },
    });

    expect(result.status).not.toBe(200);
  });

  it('rejects a member who is already active', async () => {
    const result = await callFunction<
      CreateCraftClubSubscriptionRequest,
      CreateCraftClubSubscriptionResponse
    >({
      functionName: 'createCraftClubSubscription',
      data: {
        email: ACTIVE_EMAIL,
        name: 'Active Member',
        paymentNonce: 'cnon:card-nonce-ok',
      },
    });

    expect(result.status).not.toBe(200);
  });

  it('rejects invalid input', async () => {
    const result = await callFunction<
      CreateCraftClubSubscriptionRequest,
      CreateCraftClubSubscriptionResponse
    >({
      functionName: 'createCraftClubSubscription',
      data: {
        email: 'not-an-email',
        name: 'X',
        paymentNonce: 'cnon:card-nonce-ok',
      },
    });

    expect(result.status).not.toBe(200);
  });
});
