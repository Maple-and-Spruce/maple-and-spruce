/**
 * Integration tests for etsyAuthUrl Cloud Function.
 *
 * Generates an OAuth URL with PKCE state. No Etsy API calls — the state
 * is persisted to Firestore for the callback to consume later.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type {
  EtsyAuthUrlRequest,
  EtsyAuthUrlResponse,
} from '@maple/ts/firebase/api-types';

describe('etsyAuthUrl', () => {
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

  it('rejects non-admin users', async () => {
    const result = await callFunction<EtsyAuthUrlRequest>({
      functionName: 'etsyAuthUrl',
      data: {},
      idToken: nonAdminUser.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('returns an OAuth URL and persists PKCE state to Firestore', async () => {
    const result = await callFunction<
      EtsyAuthUrlRequest,
      EtsyAuthUrlResponse
    >({
      functionName: 'etsyAuthUrl',
      data: {},
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.url).toContain('https://www.etsy.com/oauth/connect');
    expect(result.data!.url).toContain('code_challenge=');
    expect(result.data!.state).toBeTruthy();

    const saved = await getFirestoreDoc('_config', 'etsy-oauth-state');
    expect(saved).not.toBeNull();
    expect(saved!.state).toBe(result.data!.state);
    expect(saved!.codeVerifier).toBeTruthy();
  });

  it('accepts a custom scopes parameter', async () => {
    const result = await callFunction<
      EtsyAuthUrlRequest,
      EtsyAuthUrlResponse
    >({
      functionName: 'etsyAuthUrl',
      data: { scopes: 'shops_r' },
      idToken: adminUser.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.url).toContain('scope=shops_r');
  });
});
