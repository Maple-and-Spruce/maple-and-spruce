/**
 * Integration tests for getEtsyConnectionStatus Cloud Function.
 *
 * Pure Firestore read — reports whether OAuth tokens exist and whether
 * the access token is still valid. No Etsy API calls.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  deleteFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  GetEtsyConnectionStatusRequest,
  GetEtsyConnectionStatusResponse,
} from '@maple/ts/firebase/api-types';

describe('getEtsyConnectionStatus', () => {
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
    await deleteFirestoreDoc('_config', 'etsy-tokens');
  });

  it('rejects non-admin users', async () => {
    const result = await callFunction<GetEtsyConnectionStatusRequest>({
      functionName: 'getEtsyConnectionStatus',
      data: {},
      idToken: nonAdminUser.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('reports connected=false when no token document exists', async () => {
    const result = await callFunction<
      GetEtsyConnectionStatusRequest,
      GetEtsyConnectionStatusResponse
    >({
      functionName: 'getEtsyConnectionStatus',
      data: {},
      idToken: adminUser.idToken,
    });
    expect(result.status).toBe(200);
    expect(result.data!.connected).toBe(false);
    expect(result.data!.tokenValid).toBe(false);
  });

  it('reports connected=true + tokenValid=true for a fresh token', async () => {
    await setFirestoreDoc('_config', 'etsy-tokens', {
      accessToken: '11111.access',
      refreshToken: '11111.refresh',
      expiresAt: Date.now() + 3600000,
      shopId: '22222',
      userId: '11111',
    });

    const result = await callFunction<
      GetEtsyConnectionStatusRequest,
      GetEtsyConnectionStatusResponse
    >({
      functionName: 'getEtsyConnectionStatus',
      data: {},
      idToken: adminUser.idToken,
    });
    expect(result.status).toBe(200);
    expect(result.data!.connected).toBe(true);
    expect(result.data!.tokenValid).toBe(true);
    expect(result.data!.shopId).toBe('22222');
  });

  it('reports tokenValid=false for an expired token', async () => {
    await setFirestoreDoc('_config', 'etsy-tokens', {
      accessToken: '11111.access',
      refreshToken: '11111.refresh',
      expiresAt: Date.now() - 1000,
      shopId: '22222',
      userId: '11111',
    });

    const result = await callFunction<
      GetEtsyConnectionStatusRequest,
      GetEtsyConnectionStatusResponse
    >({
      functionName: 'getEtsyConnectionStatus',
      data: {},
      idToken: adminUser.idToken,
    });
    expect(result.status).toBe(200);
    expect(result.data!.connected).toBe(true);
    expect(result.data!.tokenValid).toBe(false);
  });
});
