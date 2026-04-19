/**
 * Integration tests for refreshEtsyShopId Cloud Function.
 *
 * Runs against the emulator with the Etsy mock server wired via
 * ETSY_API_BASE. Covers the no-tokens, happy-path (both response
 * shapes), and transport-failure cases.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  deleteFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  RefreshEtsyShopIdRequest,
  RefreshEtsyShopIdResponse,
} from '@maple/ts/firebase/api-types';
import { resetMock, setShopsMockConfig } from './helpers/etsy-mock-client';

describe('refreshEtsyShopId', () => {
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
    await resetMock();
    await deleteFirestoreDoc('_config', 'etsy-tokens');
  });

  async function seedTokensWithoutShopId() {
    await setFirestoreDoc('_config', 'etsy-tokens', {
      accessToken: '11111.valid-access-token',
      refreshToken: '11111.valid-refresh',
      expiresAt: Date.now() + 3600000,
      userId: '11111',
      shopId: '',
    });
  }

  it('rejects non-admin users', async () => {
    const result = await callFunction<RefreshEtsyShopIdRequest>({
      functionName: 'refreshEtsyShopId',
      data: {},
      idToken: nonAdminUser.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('returns success=false when no tokens are stored', async () => {
    const result = await callFunction<
      RefreshEtsyShopIdRequest,
      RefreshEtsyShopIdResponse
    >({
      functionName: 'refreshEtsyShopId',
      data: {},
      idToken: adminUser.idToken,
    });
    expect(result.status).toBe(200);
    expect(result.data!.success).toBe(false);
    expect(result.data!.error).toContain('not connected');
  });

  it('resolves and persists the shop ID from the paginated shape', async () => {
    await seedTokensWithoutShopId();
    await setShopsMockConfig({ shape: 'paginated', shopId: 55555 });

    const result = await callFunction<
      RefreshEtsyShopIdRequest,
      RefreshEtsyShopIdResponse
    >({
      functionName: 'refreshEtsyShopId',
      data: {},
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.success).toBe(true);
    expect(result.data!.shopId).toBe('55555');

    const saved = await getFirestoreDoc('_config', 'etsy-tokens');
    expect(saved!.shopId).toBe('55555');
  });

  it('resolves and persists the shop ID from the top-level shape', async () => {
    await seedTokensWithoutShopId();
    await setShopsMockConfig({ shape: 'top-level', shopId: 77777 });

    const result = await callFunction<
      RefreshEtsyShopIdRequest,
      RefreshEtsyShopIdResponse
    >({
      functionName: 'refreshEtsyShopId',
      data: {},
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.success).toBe(true);
    expect(result.data!.shopId).toBe('77777');

    const saved = await getFirestoreDoc('_config', 'etsy-tokens');
    expect(saved!.shopId).toBe('77777');
  });

  it('returns success=false with a reason when Etsy responds 403', async () => {
    await seedTokensWithoutShopId();
    await setShopsMockConfig({ status: 403 });

    const result = await callFunction<
      RefreshEtsyShopIdRequest,
      RefreshEtsyShopIdResponse
    >({
      functionName: 'refreshEtsyShopId',
      data: {},
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.success).toBe(false);
    expect(result.data!.status).toBe(403);
    expect(result.data!.error).toBeTruthy();

    // Stored shopId stays unset — no half-written state.
    const saved = await getFirestoreDoc('_config', 'etsy-tokens');
    expect(saved!.shopId ?? '').toBe('');
  });
});
