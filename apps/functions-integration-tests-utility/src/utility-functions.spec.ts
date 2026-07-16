import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER, NON_ADMIN_USER } from '@maple/firebase/integration-test-utils';
import type {
  CheckAdminStatusResponse,
  GetMyRolesResponse,
  GrantRoleRequest,
  GrantRoleResponse,
  RevokeRoleRequest,
  RevokeRoleResponse,
} from '@maple/ts/firebase/api-types';

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

  describe('role framework (getMyRoles / grantRole / revokeRole)', () => {
    // Fresh user so role mutations here can't bleed into the tests above
    let scopedUser: TestUser;

    beforeAll(async () => {
      scopedUser = await createTestUser(
        'scoped-roles-user@test.maple',
        'test-password-123!'
      );
    });

    it('getMyRoles rejects unauthenticated requests', async () => {
      const result = await callFunction({ functionName: 'getMyRoles' });
      expect(result.status).toBe(401);
    });

    it('getMyRoles returns [admin] for an admins/{uid} user (back-compat)', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetMyRolesResponse
      >({
        functionName: 'getMyRoles',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.roles).toEqual(['admin']);
    });

    it('getMyRoles returns [] for a user with no roles', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetMyRolesResponse
      >({
        functionName: 'getMyRoles',
        idToken: scopedUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.roles).toEqual([]);
    });

    it('grantRole is admin-only (403 for non-admin caller)', async () => {
      const result = await callFunction<GrantRoleRequest, GrantRoleResponse>({
        functionName: 'grantRole',
        idToken: scopedUser.idToken,
        data: { uid: scopedUser.uid, role: 'mt-teacher' },
      });

      expect(result.status).toBe(403);
    });

    it('grantRole rejects the admin role (admins/{uid} stays authoritative)', async () => {
      const result = await callFunction<GrantRoleRequest, GrantRoleResponse>({
        functionName: 'grantRole',
        idToken: adminUser.idToken,
        data: { uid: scopedUser.uid, role: 'admin' },
      });

      expect(result.status).toBe(400);
    });

    it('admin grants a scoped role; it shows in getMyRoles but not admin status', async () => {
      const grant = await callFunction<GrantRoleRequest, GrantRoleResponse>({
        functionName: 'grantRole',
        idToken: adminUser.idToken,
        data: { uid: scopedUser.uid, role: 'mt-teacher' },
      });
      expect(grant.status).toBe(200);
      expect(grant.data?.success).toBe(true);

      const roles = await callFunction<
        Record<string, never>,
        GetMyRolesResponse
      >({
        functionName: 'getMyRoles',
        idToken: scopedUser.idToken,
      });
      expect(roles.data?.roles).toEqual(['mt-teacher']);

      // A scoped role must NOT confer admin (back-compat contract)
      const adminStatus = await callFunction<
        Record<string, never>,
        CheckAdminStatusResponse
      >({
        functionName: 'checkAdminStatus',
        idToken: scopedUser.idToken,
      });
      expect(adminStatus.data?.isAdmin).toBe(false);
    });

    it('a scoped role does not open admin-only functions (any-of not wildcard)', async () => {
      // scopedUser now holds mt-teacher; grantRole itself requires admin
      const result = await callFunction<GrantRoleRequest, GrantRoleResponse>({
        functionName: 'grantRole',
        idToken: scopedUser.idToken,
        data: { uid: scopedUser.uid, role: 'clerk' },
      });

      expect(result.status).toBe(403);
    });

    it('users can hold multiple roles at once', async () => {
      await callFunction<GrantRoleRequest, GrantRoleResponse>({
        functionName: 'grantRole',
        idToken: adminUser.idToken,
        data: { uid: scopedUser.uid, role: 'clerk' },
      });
      await callFunction<GrantRoleRequest, GrantRoleResponse>({
        functionName: 'grantRole',
        idToken: adminUser.idToken,
        data: { uid: scopedUser.uid, role: 'lesson-teacher' },
      });

      const roles = await callFunction<
        Record<string, never>,
        GetMyRolesResponse
      >({
        functionName: 'getMyRoles',
        idToken: scopedUser.idToken,
      });

      expect(roles.data?.roles).toEqual(
        expect.arrayContaining(['mt-teacher', 'clerk', 'lesson-teacher'])
      );
      expect(roles.data?.roles).toHaveLength(3);
    });

    it('revokeRole removes a single role and leaves the rest', async () => {
      const revoke = await callFunction<
        RevokeRoleRequest,
        RevokeRoleResponse
      >({
        functionName: 'revokeRole',
        idToken: adminUser.idToken,
        data: { uid: scopedUser.uid, role: 'mt-teacher' },
      });
      expect(revoke.status).toBe(200);
      expect(revoke.data?.success).toBe(true);

      const roles = await callFunction<
        Record<string, never>,
        GetMyRolesResponse
      >({
        functionName: 'getMyRoles',
        idToken: scopedUser.idToken,
      });

      expect(roles.data?.roles).toEqual(
        expect.arrayContaining(['clerk', 'lesson-teacher'])
      );
      expect(roles.data?.roles).not.toContain('mt-teacher');
    });

    it('revokeRole is admin-only (403 for non-admin caller)', async () => {
      const result = await callFunction<
        RevokeRoleRequest,
        RevokeRoleResponse
      >({
        functionName: 'revokeRole',
        idToken: scopedUser.idToken,
        data: { uid: scopedUser.uid, role: 'clerk' },
      });

      expect(result.status).toBe(403);
    });
  });

});
