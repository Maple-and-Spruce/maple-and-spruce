/**
 * Integration tests for the publish flag on the remove* methods.
 *
 * Exercises the real `webflow-api` SDK against an in-process mock HTTP
 * server (no Firebase emulator required). Verifies end-to-end that:
 *
 * - publish=true → SDK hits DELETE /collections/:id/items/:itemId/live
 * - publish=false (default) → SDK hits DELETE /collections/:id/items/:itemId
 *
 * The unit specs (class.service.spec.ts etc.) mock the SDK client, so
 * this file is the only place the wire-level contract is verified.
 */
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { WebflowClient } from 'webflow-api';
import type { Artist, Class, Instructor } from '@maple/ts/domain';
import {
  MockServer,
  registerWebflowRoutes,
  resetWebflowState,
  getWebflowDeleteLog,
} from '@maple/firebase/integration-test-mock-server';
import { ClassService } from './class.service';
import { ArtistService } from './artist.service';
import { InstructorService } from './instructor.service';

const CLASSES_COLLECTION = 'col-classes';
const ARTISTS_COLLECTION = 'col-artists';
const INSTRUCTORS_COLLECTION = 'col-instructors';

// Use a non-default port to avoid colliding with the shared 9999 used by
// run-integration-tests.sh when both harnesses run on the same machine.
const PORT = 19999;
const BASE_URL = `http://localhost:${PORT}`;

let server: MockServer;
let client: WebflowClient;

beforeAll(async () => {
  server = new MockServer();
  registerWebflowRoutes(server);
  await server.start(PORT);

  client = new WebflowClient({
    accessToken: 'mock-token',
    baseUrl: BASE_URL,
  });
});

afterAll(async () => {
  await server.stop();
});

beforeEach(() => {
  resetWebflowState();
  server.clearRequests();
});

/**
 * Seed a CMS item via the SDK's createItem. Returns the Webflow item ID.
 * Creates an item with the given firebase-id so the service's
 * findByFirebaseId lookup resolves it.
 */
async function seedItem(
  collectionId: string,
  firebaseId: string
): Promise<string> {
  const response = await client.collections.items.createItem(collectionId, {
    isArchived: false,
    isDraft: false,
    fieldData: {
      name: `seed-${firebaseId}`,
      slug: `seed-${firebaseId}`,
      'firebase-id': firebaseId,
    },
  });
  if (!response.id) throw new Error('Mock server did not return an item id');
  return response.id;
}

describe('ClassService.removeClass — publish flag routing', () => {
  const service = () => new ClassService(client, CLASSES_COLLECTION);

  const mockClass: Class = {
    id: 'class-pub-true',
    name: 'Seed Class',
  } as Class;

  it('hits the /live delete endpoint when publish=true', async () => {
    const itemId = await seedItem(CLASSES_COLLECTION, mockClass.id);

    const removed = await service().removeClass(mockClass.id, true);

    expect(removed).toBe(true);
    const log = getWebflowDeleteLog();
    expect(log).toEqual([{ itemId, live: true }]);
  });

  it('hits the staged delete endpoint when publish=false', async () => {
    const itemId = await seedItem(CLASSES_COLLECTION, 'class-pub-false');

    const removed = await service().removeClass('class-pub-false', false);

    expect(removed).toBe(true);
    const log = getWebflowDeleteLog();
    expect(log).toEqual([{ itemId, live: false }]);
  });

  it('defaults to the staged delete endpoint when publish is omitted', async () => {
    const itemId = await seedItem(CLASSES_COLLECTION, 'class-default');

    await service().removeClass('class-default');

    expect(getWebflowDeleteLog()).toEqual([{ itemId, live: false }]);
  });
});

describe('ArtistService.removeArtist — publish flag routing', () => {
  const service = () => new ArtistService(client, ARTISTS_COLLECTION);

  const mockArtist: Artist = {
    id: 'artist-pub-true',
    name: 'Seed Artist',
  } as Artist;

  it('hits the /live delete endpoint when publish=true', async () => {
    const itemId = await seedItem(ARTISTS_COLLECTION, mockArtist.id);

    const removed = await service().removeArtist(mockArtist.id, true);

    expect(removed).toBe(true);
    expect(getWebflowDeleteLog()).toEqual([{ itemId, live: true }]);
  });

  it('hits the staged delete endpoint when publish=false', async () => {
    const itemId = await seedItem(ARTISTS_COLLECTION, 'artist-pub-false');

    const removed = await service().removeArtist('artist-pub-false', false);

    expect(removed).toBe(true);
    expect(getWebflowDeleteLog()).toEqual([{ itemId, live: false }]);
  });
});

describe('InstructorService.removeInstructor — publish flag routing', () => {
  const service = () => new InstructorService(client, INSTRUCTORS_COLLECTION);

  const mockInstructor: Instructor = {
    id: 'inst-pub-true',
    name: 'Seed Instructor',
  } as Instructor;

  it('hits the /live delete endpoint when publish=true', async () => {
    const itemId = await seedItem(INSTRUCTORS_COLLECTION, mockInstructor.id);

    const removed = await service().removeInstructor(mockInstructor.id, true);

    expect(removed).toBe(true);
    expect(getWebflowDeleteLog()).toEqual([{ itemId, live: true }]);
  });

  it('hits the staged delete endpoint when publish=false', async () => {
    const itemId = await seedItem(INSTRUCTORS_COLLECTION, 'inst-pub-false');

    const removed = await service().removeInstructor('inst-pub-false', false);

    expect(removed).toBe(true);
    expect(getWebflowDeleteLog()).toEqual([{ itemId, live: false }]);
  });
});
