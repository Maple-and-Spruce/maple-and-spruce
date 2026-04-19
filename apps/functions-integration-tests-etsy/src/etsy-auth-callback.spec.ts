/**
 * Integration tests for etsyAuthCallback Cloud Function.
 *
 * Completes the OAuth flow: validates the PKCE state, exchanges the
 * authorization code with the Etsy token endpoint (mocked), then fetches
 * the user's shop ID (mocked). Asserts the token + shop ID persist to
 * Firestore under _config/etsy-tokens.
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
  EtsyAuthCallbackRequest,
  EtsyAuthCallbackResponse,
} from '@maple/ts/firebase/api-types';
import { resetMock } from './helpers/etsy-mock-client';

describe('etsyAuthCallback', () => {
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
    await deleteFirestoreDoc('_config', 'etsy-oauth-state');
  });

  it('rejects non-admin users', async () => {
    const result = await callFunction<EtsyAuthCallbackRequest>({
      functionName: 'etsyAuthCallback',
      data: { code: 'abc', state: 'xyz' },
      idToken: nonAdminUser.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects an unknown state', async () => {
    const result = await callFunction<EtsyAuthCallbackRequest>({
      functionName: 'etsyAuthCallback',
      data: { code: 'abc', state: 'never-saved' },
      idToken: adminUser.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('exchanges the code, fetches shop ID, and persists tokens', async () => {
    // Seed a valid OAuth state as if etsyAuthUrl had run before.
    await setFirestoreDoc('_config', 'etsy-oauth-state', {
      state: 'state-ok',
      codeVerifier: 'verifier-xyz',
      createdAt: new Date(),
    });

    const result = await callFunction<
      EtsyAuthCallbackRequest,
      EtsyAuthCallbackResponse
    >({
      functionName: 'etsyAuthCallback',
      data: { code: 'auth-code', state: 'state-ok' },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.success).toBe(true);
    expect(result.data!.shopId).toBe('22222');
    expect(result.data!.userId).toBe('11111');

    const saved = await getFirestoreDoc('_config', 'etsy-tokens');
    expect(saved).not.toBeNull();
    expect(saved!.accessToken).toBe('11111.valid-access-token');
    expect(saved!.shopId).toBe('22222');
  });
});
