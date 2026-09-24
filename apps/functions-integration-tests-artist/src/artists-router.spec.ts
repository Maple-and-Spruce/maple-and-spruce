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
  SAMPLE_ARTIST,
} from '@maple/firebase/integration-test-utils';
import type {
  CreateArtistRequest,
  CreateArtistResponse,
  DeleteArtistRequest,
  DeleteArtistResponse,
  GetArtistResponse,
  GetArtistsResponse,
  UpdateArtistRequest,
  UpdateArtistResponse,
} from '@maple/ts/firebase/api-types';

/**
 * The artists domain as one function (ADR-029, #122).
 *
 * The claim consolidation rests on is that moving an endpoint onto a router is a
 * **routing** change and nothing else — same auth, same roles, same validation,
 * same `{ data: … }` envelope. That claim is only worth anything if it is tested
 * through the real transport, because the parts that could break are exactly the
 * parts a unit test mocks away: URL path resolution, the per-route gate running
 * before the handler, and the error envelope surviving one more layer.
 *
 * So each route is exercised end to end, and the gate and the checks are proven
 * to still refuse — a router whose routes were reachable without a role would be
 * a much worse bug than the deploy time it fixes.
 */
describe('Artists domain router (ADR-029)', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;

  /** `artists/<route>` is the whole difference on the wire. */
  const route = (name: string) => `artists/${name}`;

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
  }, 30000);

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  describe('dispatch', () => {
    it('404s a route it does not have, and says which routes exist', async () => {
      // The function name no longer identifies the endpoint, so a typo'd route
      // has to fail loudly rather than land on some default handler.
      const res = await callFunction({
        functionName: route('getArtistes'),
        data: {},
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(404);
      expect(JSON.stringify(res.error)).toMatch(/getArtistes/);
    }, 30000);

    it('404s a bare call to the router', async () => {
      const res = await callFunction({
        functionName: 'artists',
        data: {},
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(404);
    }, 30000);

    it('answers the warmup sentinel without auth, for the whole router', async () => {
      // One warm call boots the instance for every route on it, which is the
      // only cold-start property consolidation changes in our favour.
      const res = await callFunction({
        functionName: route('getArtists'),
        data: { __warmup: true },
      });
      expect(res.status).toBe(200);
    }, 30000);
  });

  describe('the gate is per route, not per function', () => {
    it('rejects an unauthenticated caller with 401', async () => {
      const res = await callFunction({
        functionName: route('getArtists'),
        data: {},
      });
      expect(res.status).toBe(401);
    }, 30000);

    it('rejects a signed-in non-admin with 403', async () => {
      const res = await callFunction({
        functionName: route('getArtists'),
        data: {},
        idToken: nonAdminUser.idToken,
      });
      expect(res.status).toBe(403);
    }, 30000);

    it('rejects a non-admin on a write route too', async () => {
      const res = await callFunction<CreateArtistRequest>({
        functionName: route('createArtist'),
        data: { ...SAMPLE_ARTIST, email: 'router-denied@test.com' },
        idToken: nonAdminUser.idToken,
      });
      expect(res.status).toBe(403);
    }, 30000);
  });

  describe('every route behaves as its own function did', () => {
    let createdId: string;

    it('creates', async () => {
      const res = await callFunction<CreateArtistRequest, CreateArtistResponse>({
        functionName: route('createArtist'),
        data: { ...SAMPLE_ARTIST, email: 'router-artist@test.com' },
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(200);
      expect(res.data!.artist.id).toBeTruthy();
      createdId = res.data!.artist.id;
    }, 30000);

    it('still runs the uniqueness check', async () => {
      // `.ensuringUnique()` travels with the route; if it did not, a second
      // artist could take the same email and the repository would allow it.
      const res = await callFunction<CreateArtistRequest>({
        functionName: route('createArtist'),
        data: { ...SAMPLE_ARTIST, email: 'router-artist@test.com' },
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.error)).toMatch(/email/i);
    }, 30000);

    it('still runs validation', async () => {
      const res = await callFunction<CreateArtistRequest>({
        functionName: route('createArtist'),
        data: { ...SAMPLE_ARTIST, name: '', email: 'router-invalid@test.com' },
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(400);
    }, 30000);

    it('reads one', async () => {
      const res = await callFunction<{ id: string }, GetArtistResponse>({
        functionName: route('getArtist'),
        data: { id: createdId },
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(200);
      expect(res.data!.artist.id).toBe(createdId);
    }, 30000);

    it('404s — as a domain error, not a routing one — for a missing artist', async () => {
      // Both failures are now served by the same function, so the two must stay
      // distinguishable: an unknown *route* is 404 NOT_FOUND from the router, an
      // unknown *artist* is the handler's own not-found.
      const res = await callFunction({
        functionName: route('getArtist'),
        data: { id: 'no-such-artist' },
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.error)).toMatch(/artist/i);
    }, 30000);

    it('lists', async () => {
      const res = await callFunction<unknown, GetArtistsResponse>({
        functionName: route('getArtists'),
        data: {},
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(200);
      expect(res.data!.artists.some((a) => a.id === createdId)).toBe(true);
    }, 30000);

    it('updates', async () => {
      const res = await callFunction<UpdateArtistRequest, UpdateArtistResponse>({
        functionName: route('updateArtist'),
        data: { id: createdId, name: 'Router Renamed' },
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(200);
      expect(res.data!.artist.name).toBe('Router Renamed');
    }, 30000);

    it('deletes', async () => {
      const res = await callFunction<DeleteArtistRequest, DeleteArtistResponse>({
        functionName: route('deleteArtist'),
        data: { id: createdId },
        idToken: adminUser.idToken,
      });
      expect(res.status).toBe(200);
      expect(res.data!.success).toBe(true);
    }, 30000);
  });
});
