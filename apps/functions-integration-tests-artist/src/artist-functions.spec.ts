import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { ADMIN_USER, NON_ADMIN_USER, SAMPLE_ARTIST } from '@maple/firebase/integration-test-utils';
import type {
  CreateArtistRequest,
  CreateArtistResponse,
  GetArtistsResponse,
  GetArtistResponse,
  UpdateArtistRequest,
  UpdateArtistResponse,
  DeleteArtistRequest,
  DeleteArtistResponse,
} from '@maple/ts/firebase/api-types';

/**
 * The artist endpoints' behavioural contract — unchanged by ADR-029.
 *
 * These cases were written against five separate Cloud Functions. When those
 * were replaced by the `artists` router, only the `functionName` changed
 * (`createArtist` → `artists/createArtist`): the auth guard, the duplicate-email
 * rejection, the validation failures and the CRUD lifecycle all still have to
 * hold, and a router that quietly dropped one of them would fail here. That is
 * the point of leaving this suite pointed at the new function rather than
 * deleting it alongside the old ones.
 *
 * Routing itself — dispatch, unknown routes, per-route gating — is covered in
 * `artists-router.spec.ts`.
 */
describe('Artist Functions', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(
      ADMIN_USER.email,
      ADMIN_USER.password
    );
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
      const result = await callFunction<CreateArtistRequest>({
        functionName: 'artists/createArtist',
        data: SAMPLE_ARTIST,
      });
      expect(result.status).toBe(401);
    });

    it('should reject non-admin users', async () => {
      const result = await callFunction<CreateArtistRequest>({
        functionName: 'artists/createArtist',
        data: SAMPLE_ARTIST,
        idToken: nonAdminUser.idToken,
      });
      expect([403, 500]).toContain(result.status);
    });
  });

  describe('CRUD lifecycle', () => {
    let artistId: string;

    it('should create an artist', async () => {
      const result = await callFunction<
        CreateArtistRequest,
        CreateArtistResponse
      >({
        functionName: 'artists/createArtist',
        data: SAMPLE_ARTIST,
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.artist).toBeDefined();
      expect(result.data?.artist.name).toBe(SAMPLE_ARTIST.name);
      expect(result.data?.artist.email).toBe(SAMPLE_ARTIST.email);
      expect(result.data?.artist.defaultCommissionRate).toBe(
        SAMPLE_ARTIST.defaultCommissionRate
      );
      expect(result.data?.artist.id).toBeDefined();

      artistId = result.data!.artist.id;
    });

    it('should reject duplicate email on create', async () => {
      const result = await callFunction<CreateArtistRequest>({
        functionName: 'artists/createArtist',
        data: SAMPLE_ARTIST,
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should get all artists', async () => {
      const result = await callFunction<
        Record<string, never>,
        GetArtistsResponse
      >({
        functionName: 'artists/getArtists',
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.artists).toBeDefined();
      expect(result.data?.artists.length).toBeGreaterThanOrEqual(1);
    });

    it('should get artist by id', async () => {
      const result = await callFunction<
        { id: string },
        GetArtistResponse
      >({
        functionName: 'artists/getArtist',
        data: { id: artistId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.artist.id).toBe(artistId);
      expect(result.data?.artist.name).toBe(SAMPLE_ARTIST.name);
    });

    it('should update an artist', async () => {
      const result = await callFunction<
        UpdateArtistRequest,
        UpdateArtistResponse
      >({
        functionName: 'artists/updateArtist',
        data: {
          id: artistId,
          name: 'Updated Artist Name',
          defaultCommissionRate: 0.5,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.artist.name).toBe('Updated Artist Name');
      expect(result.data?.artist.defaultCommissionRate).toBe(0.5);
      expect(result.data?.artist.email).toBe(SAMPLE_ARTIST.email);
    });

    it('should delete an artist', async () => {
      const result = await callFunction<
        DeleteArtistRequest,
        DeleteArtistResponse
      >({
        functionName: 'artists/deleteArtist',
        data: { id: artistId },
        idToken: adminUser.idToken,
      });

      expect(result.status).toBe(200);
      expect(result.data?.success).toBe(true);
    });

    it('should return not-found for deleted artist', async () => {
      const result = await callFunction<{ id: string }>({
        functionName: 'artists/getArtist',
        data: { id: artistId },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });

  describe('Validation', () => {
    it('should reject artist with missing name', async () => {
      const result = await callFunction<Partial<CreateArtistRequest>>({
        functionName: 'artists/createArtist',
        data: {
          email: 'no-name@test.com',
          status: 'active',
          defaultCommissionRate: 0.4,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject artist with invalid email', async () => {
      const result = await callFunction<Partial<CreateArtistRequest>>({
        functionName: 'artists/createArtist',
        data: {
          name: 'Bad Email Artist',
          email: 'not-an-email',
          status: 'active',
          defaultCommissionRate: 0.4,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });

    it('should reject artist with commission rate > 1', async () => {
      const result = await callFunction<Partial<CreateArtistRequest>>({
        functionName: 'artists/createArtist',
        data: {
          name: 'Bad Rate Artist',
          email: 'bad-rate@test.com',
          status: 'active',
          defaultCommissionRate: 1.5,
        },
        idToken: adminUser.idToken,
      });

      expect(result.status).not.toBe(200);
    });
  });
});
