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

  describe('warmup sentinel (Functions.endpoint.handle())', () => {
    // The shared function builder accepts `{ __warmup: true }` and returns
    // 200 + { warm: true } without running auth, validator, or the handler.
    // These tests assert the contract over a real HTTP layer (emulator),
    // complementing the unit tests in functions.utility.spec.ts.

    it('returns 200 + { warm: true } against a public endpoint', async () => {
      const result = await callFunction<
        { __warmup: true },
        { warm: boolean }
      >({
        functionName: 'healthCheck',
        data: { __warmup: true },
      });

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ warm: true });
    });

    it('bypasses required auth — no idToken needed', async () => {
      // checkAdminStatus normally returns 401 without an idToken (see test
      // below). With the warmup sentinel it must short-circuit BEFORE the
      // auth check and return 200 even anonymously.
      const result = await callFunction<
        { __warmup: true },
        { warm: boolean }
      >({
        functionName: 'checkAdminStatus',
        data: { __warmup: true },
      });

      expect(result.status).toBe(200);
      expect(result.data).toEqual({ warm: true });
    });

    it('does not short-circuit when __warmup is not strictly true', async () => {
      // A real `healthCheck` payload that happens to carry a truthy-but-not-
      // true `__warmup` should run the real handler, not the warmup branch.
      const result = await callFunction<
        { __warmup: string },
        { status: string; timestamp: string }
      >({
        functionName: 'healthCheck',
        data: { __warmup: 'yes' },
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
