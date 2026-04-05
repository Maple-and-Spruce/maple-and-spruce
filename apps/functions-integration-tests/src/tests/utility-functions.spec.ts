import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '../utils/index.js';
import type { TestUser } from '../utils/index.js';
import { ADMIN_USER, NON_ADMIN_USER } from '../fixtures/index.js';
import type {
  CheckAdminStatusResponse,
  GetPublicArtistsResponse,
} from '@maple/ts/firebase/api-types';
import type { CreateArtistRequest } from '@maple/ts/firebase/api-types';

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

  describe('getPublicArtists', () => {
    let artistId: string;

    beforeAll(async () => {
      // Create an active artist to appear in public results
      const result = await callFunction<
        CreateArtistRequest,
        { artist: { id: string } }
      >({
        functionName: 'createArtist',
        data: {
          name: 'Public Test Artist',
          email: 'public-test@test.com',
          status: 'active',
          defaultCommissionRate: 0.4,
        },
        idToken: adminUser.idToken,
      });
      artistId = result.data!.artist.id;
    });

    afterAll(async () => {
      await callFunction({
        functionName: 'deleteArtist',
        data: { id: artistId },
        idToken: adminUser.idToken,
      });
    });

    it('should return artists without auth', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetPublicArtistsResponse
      >({
        functionName: 'getPublicArtists',
      });

      expect(result.status).toBe(200);
      expect(result.data?.artists).toBeDefined();
      expect(result.data?.artists.length).toBeGreaterThanOrEqual(1);
    });

    it('should strip sensitive fields from public artists', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetPublicArtistsResponse
      >({
        functionName: 'getPublicArtists',
      });

      expect(result.status).toBe(200);
      const artist = result.data?.artists.find((a) => a.id === artistId);
      expect(artist).toBeDefined();
      expect(artist?.name).toBe('Public Test Artist');
      // Sensitive fields should not be present
      expect((artist as unknown as Record<string, unknown>)['email']).toBeUndefined();
      expect(
        (artist as unknown as Record<string, unknown>)['defaultCommissionRate']
      ).toBeUndefined();
    });
  });
});
