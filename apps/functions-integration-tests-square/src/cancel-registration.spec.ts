/**
 * Integration tests for cancelRegistration Cloud Function.
 *
 * Uses the mock HTTP server for Square refund API calls. Seeds a
 * registration directly into Firestore and exercises:
 *  - Auth guard (non-admin rejected)
 *  - Happy path cancel without refund
 *  - Happy path cancel with refund (hits mock Square /v2/refunds)
 *  - Domain guards: invalid argument (missing id), not-found,
 *    failed-precondition (already cancelled / refunded),
 *    failed-precondition when refund requested on refund-ineligible status.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  EMULATOR_CONFIG,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  CancelRegistrationRequest,
  CancelRegistrationResponse,
} from '@maple/ts/firebase/api-types';

const CLASS_ID = 'test-cancel-class';

function baseRegistration(overrides: Record<string, unknown> = {}) {
  return {
    classId: CLASS_ID,
    customerEmail: 'cancel@test.com',
    customerName: 'Cancel Customer',
    quantity: 1,
    pricePaidCents: 4770,
    subtotalCents: 4500,
    taxAmountCents: 270,
    taxRatePercent: 6.0,
    status: 'confirmed',
    confirmationNumber: 'MS-CAN001',
    squarePaymentId: 'mock-payment-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('cancelRegistration', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdminUser = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );

    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('Auth guard', () => {
    it('should reject unauthenticated requests', async () => {
      await setFirestoreDoc(
        'registrations',
        'auth-test-1',
        baseRegistration()
      );
      const result = await callFunction<CancelRegistrationRequest>({
        functionName: 'cancelRegistration',
        data: { id: 'auth-test-1' },
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject non-admin users', async () => {
      await setFirestoreDoc(
        'registrations',
        'auth-test-2',
        baseRegistration()
      );
      const result = await callFunction<CancelRegistrationRequest>({
        functionName: 'cancelRegistration',
        data: { id: 'auth-test-2' },
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Domain guards', () => {
    it('should reject missing id (invalid-argument)', async () => {
      const result = await callFunction<Partial<CancelRegistrationRequest>>({
        functionName: 'cancelRegistration',
        data: {},
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject non-existent registration (not-found)', async () => {
      const result = await callFunction<CancelRegistrationRequest>({
        functionName: 'cancelRegistration',
        data: { id: 'does-not-exist' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject cancel on already-cancelled registration', async () => {
      await setFirestoreDoc(
        'registrations',
        'already-cancelled',
        baseRegistration({ status: 'cancelled' })
      );
      const result = await callFunction<CancelRegistrationRequest>({
        functionName: 'cancelRegistration',
        data: { id: 'already-cancelled' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject cancel on already-refunded registration', async () => {
      await setFirestoreDoc(
        'registrations',
        'already-refunded',
        baseRegistration({ status: 'refunded' })
      );
      const result = await callFunction<CancelRegistrationRequest>({
        functionName: 'cancelRegistration',
        data: { id: 'already-refunded' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Happy path', () => {
    it('should cancel a confirmed registration without refund', async () => {
      await setFirestoreDoc(
        'registrations',
        'cancel-no-refund',
        baseRegistration()
      );

      const result = await callFunction<
        CancelRegistrationRequest,
        CancelRegistrationResponse
      >({
        functionName: 'cancelRegistration',
        data: { id: 'cancel-no-refund' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.status).toBe('cancelled');
      expect(result.data?.refundId).toBeUndefined();
      expect(result.data?.registration.refundedAt).toBeUndefined();
    });

    it('should cancel and refund a confirmed registration with payment', async () => {
      await setFirestoreDoc(
        'registrations',
        'cancel-with-refund',
        baseRegistration({ squarePaymentId: 'mock-payment-refund-1' })
      );

      const result = await callFunction<
        CancelRegistrationRequest,
        CancelRegistrationResponse
      >({
        functionName: 'cancelRegistration',
        data: { id: 'cancel-with-refund', refund: true },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.status).toBe('refunded');
      expect(result.data?.refundId).toBeDefined();
      expect(result.data?.refundId).toMatch(/^mock-refund-/);
      // Instructor payouts need to know when a refund happened and for how much.
      expect(result.data?.registration.refundedAt).toBeDefined();
      expect(result.data?.registration.refundedAmountCents).toBeGreaterThan(0);
      expect(result.data?.registration.squareRefundId).toBe(result.data?.refundId);
      // Recorded as counted, so Square's refund webhook for it is a no-op (#144).
      expect(result.data?.registration.squareRefundIds).toEqual([result.data?.refundId]);
    });

    it('should cancel without refund when refund=true but no squarePaymentId', async () => {
      // Free registration — no payment to refund. The function still
      // cancels successfully (refund branch is skipped).
      await setFirestoreDoc(
        'registrations',
        'cancel-free',
        baseRegistration({
          squarePaymentId: undefined,
          pricePaidCents: 0,
          subtotalCents: 0,
          taxAmountCents: 0,
        })
      );

      const result = await callFunction<
        CancelRegistrationRequest,
        CancelRegistrationResponse
      >({
        functionName: 'cancelRegistration',
        data: { id: 'cancel-free', refund: true },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.status).toBe('cancelled');
      expect(result.data?.refundId).toBeUndefined();
    });
  });

  describe('Already refunded in Square (refundedInSquare, #144)', () => {
    const SQUARE_MOCK = EMULATOR_CONFIG.squareMockServerUrl;

    async function refundCalls(): Promise<number> {
      const body = (await (await fetch(`${SQUARE_MOCK}/_mock/requests`)).json()) as {
        requests: Array<{ method: string; path: string }>;
      };
      return body.requests.filter(
        (r) => r.method === 'POST' && r.path.startsWith('/v2/refunds')
      ).length;
    }

    beforeEach(async () => {
      await fetch(`${SQUARE_MOCK}/_mock/reset`, { method: 'POST' });
    });

    it('records a flagged refund without refunding again, and clears the review', async () => {
      await setFirestoreDoc(
        'registrations',
        'cancel-flagged',
        baseRegistration({
          source: 'pos',
          pricePaidCents: 6360,
          squareRefundIds: ['rf-dash-1'],
          refundReviewAt: new Date().toISOString(),
          refundReviewAmountCents: 2000,
          refundReviewId: 'rf-dash-1',
        })
      );

      const result = await callFunction<
        CancelRegistrationRequest,
        CancelRegistrationResponse
      >({
        functionName: 'cancelRegistration',
        data: { id: 'cancel-flagged', refundedInSquare: true },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.refundId).toBeUndefined();
      expect(result.data?.registration).toMatchObject({
        status: 'refunded',
        refundedAmountCents: 2000,
        squareRefundId: 'rf-dash-1',
      });
      expect(result.data?.registration.refundedAt).toBeDefined();
      expect(result.data?.registration.refundReviewAt).toBeUndefined();
      expect(await refundCalls()).toBe(0);

      const stored = await getFirestoreDoc('registrations', 'cancel-flagged');
      expect(stored).toMatchObject({
        status: 'refunded',
        refundReviewAt: null,
        refundReviewAmountCents: null,
        refundReviewId: null,
      });
    });

    it('records the whole price for a dashboard refund nothing flagged', async () => {
      await setFirestoreDoc('registrations', 'cancel-backfill', baseRegistration());

      const result = await callFunction<
        CancelRegistrationRequest,
        CancelRegistrationResponse
      >({
        functionName: 'cancelRegistration',
        data: { id: 'cancel-backfill', refundedInSquare: true },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.status).toBe('refunded');
      expect(result.data?.registration.refundedAmountCents).toBe(4770);
      expect(await refundCalls()).toBe(0);
    });

    it('rejects asking for a refund and already refunded together', async () => {
      await setFirestoreDoc('registrations', 'cancel-both', baseRegistration());

      const result = await callFunction<
        CancelRegistrationRequest,
        CancelRegistrationResponse
      >({
        functionName: 'cancelRegistration',
        data: { id: 'cancel-both', refund: true, refundedInSquare: true },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(400);
      expect(await refundCalls()).toBe(0);
      expect((await getFirestoreDoc('registrations', 'cancel-both'))?.['status']).toBe(
        'confirmed'
      );
    });
  });
});

