import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER, NON_ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type { CheckAdminStatusResponse } from '@maple/ts/firebase/api-types';

describe('Utility Functions', () => {
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

  describe('healthCheck', () => {
    it('should return ok status without auth', async () => {
      const result = await callFunction<
        Record<string, never>,
        { status: string; timestamp: string }
      >({
        functionName: 'healthCheck',
      });

      expect(result.status).toBe(200);
      expect(result.data?.status).toBe('ok');
      expect(result.data?.timestamp).toBeDefined();
    });
  });

  describe('checkAdminStatus', () => {
    it('should reject unauthenticated requests', async () => {
      const result = await callFunction({
        functionName: 'checkAdminStatus',
      });
      expect(result.status).toBe(401);
    });

    it('should return true for admin user', async () => {
      const result = await callFunction<
        Record<string, never>,
        CheckAdminStatusResponse
      >({
        functionName: 'checkAdminStatus',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.isAdmin).toBe(true);
    });

    it('should return false for non-admin user', async () => {
      const result = await callFunction<
        Record<string, never>,
        CheckAdminStatusResponse
      >({
        functionName: 'checkAdminStatus',
        idToken: nonAdminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.isAdmin).toBe(false);
    });
  });

});
