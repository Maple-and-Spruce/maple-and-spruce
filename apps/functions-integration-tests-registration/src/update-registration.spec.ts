/**
 * Integration tests for updateRegistration Cloud Function.
 *
 * Seeds a registration directly into Firestore and exercises the admin
 * update endpoint. Verifies that:
 *  - Valid partial updates succeed and preserve unchanged fields.
 *  - Invalid field values are rejected by the Vest `registrationValidation`
 *    suite with an invalid-argument error.
 *  - Non-existent registrations produce a not-found style error.
 *  - Non-admin / unauthenticated callers are rejected before validation.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  UpdateRegistrationRequest,
  UpdateRegistrationResponse,
} from '@maple/ts/firebase/api-types';

const REGISTRATION_ID = 'test-reg-update-1';
const CLASS_ID = 'test-reg-update-class';

const BASE_REGISTRATION = {
  classId: CLASS_ID,
  customerEmail: 'original@test.com',
  customerName: 'Original Customer',
  customerPhone: '+1 304-555-0100',
  quantity: 1,
  pricePaidCents: 4770,
  subtotalCents: 4500,
  taxAmountCents: 270,
  taxRatePercent: 6.0,
  status: 'confirmed',
  notes: 'Original notes',
  confirmationNumber: 'MS-ABC123',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('updateRegistration', () => {
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

  beforeEach(async () => {
    // Re-seed the registration before each test so mutations don't leak.
    await setFirestoreDoc('registrations', REGISTRATION_ID, BASE_REGISTRATION);
  });

  describe('Auth guard', () => {
    it('should reject unauthenticated requests', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, status: 'no-show' },
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, status: 'no-show' },
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Happy path', () => {
    it('should update status alone without requiring other fields', async () => {
      const result = await callFunction<
        UpdateRegistrationRequest,
        UpdateRegistrationResponse
      >({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, status: 'no-show' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.status).toBe('no-show');
      expect(result.data?.registration.customerEmail).toBe(
        BASE_REGISTRATION.customerEmail
      );
      expect(result.data?.registration.customerName).toBe(
        BASE_REGISTRATION.customerName
      );
    });

    it('should update notes alone', async () => {
      const result = await callFunction<
        UpdateRegistrationRequest,
        UpdateRegistrationResponse
      >({
        functionName: 'updateRegistration',
        data: {
          id: REGISTRATION_ID,
          notes: 'Customer requested a window seat.',
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.notes).toBe(
        'Customer requested a window seat.'
      );
    });

    it('should update customerName with valid value', async () => {
      const result = await callFunction<
        UpdateRegistrationRequest,
        UpdateRegistrationResponse
      >({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, customerName: 'Updated Customer' },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.registration.customerName).toBe('Updated Customer');
    });
  });

  describe('Validation (Vest suite)', () => {
    it('should reject invalid customerEmail', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, customerEmail: 'not-an-email' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject customerName that is too short', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, customerName: 'A' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject quantity greater than 10', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, quantity: 42 },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject quantity less than 1', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, quantity: 0 },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject notes longer than 500 characters', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, notes: 'x'.repeat(501) },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject invalid customerPhone', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: REGISTRATION_ID, customerPhone: 'abc' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Not found', () => {
    it('should reject update for a non-existent registration', async () => {
      const result = await callFunction<UpdateRegistrationRequest>({
        functionName: 'updateRegistration',
        data: { id: 'does-not-exist', status: 'no-show' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });

    it('should reject missing id', async () => {
      const result = await callFunction<Partial<UpdateRegistrationRequest>>({
        functionName: 'updateRegistration',
        data: { status: 'no-show' },
        idToken: adminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });
});
