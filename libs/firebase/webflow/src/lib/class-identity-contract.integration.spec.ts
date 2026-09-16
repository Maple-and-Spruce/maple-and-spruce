/**
 * Contract: ONE class is ONE Webflow CMS item. Forever.
 *
 * `firebase-id` is the only key tying a CMS item back to a class. Webflow
 * enforces no uniqueness on it, so this invariant is upheld entirely by
 * `ClassService.syncClass` — and it is currently upheld by nothing at all,
 * because the create-vs-update decision is an unguarded read-then-write:
 *
 *     const existingItemId = await this.resolveExistingItemId(...)
 *     if (existingItemId) { update } else { createItem }
 *
 * Two invocations that interleave between the read and the write both see
 * "absent" and both create. The loser of the subsequent `webflowItemId`
 * write-back is then orphaned: no Firestore record points at it, so no later
 * sync ever updates it, and its `spots-remaining` freezes at creation time.
 * The live site renders both, disagreeing about availability — a class that is
 * genuinely full advertising free places on the twin card.
 *
 * These tests drive the REAL webflow-api SDK against the in-process mock
 * server, the same way `delete-publish.integration.spec.ts` does, because the
 * invariant is stateful and cross-call: it cannot be observed by a mocked
 * client or a pure-function mapper test. `webflow-page-contract.spec.ts` pins
 * the field slugs the Designer binds to; this file pins the identity guarantee
 * underneath them.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebflowClient } from 'webflow-api';
import type { PublishableClass } from '@maple/ts/domain';
import {
  WebflowMockServer,
  registerWebflowRoutes,
  resetWebflowState,
  failNextWebflowLookups,
  clearWebflowLookupFailures,
} from '@maple/firebase/webflow-test-mock-server';
import { ClassService } from './class.service';

const CLASSES_COLLECTION = 'col-classes';

// Distinct from delete-publish.integration.spec.ts's 19999 so the two files
// can run in the same vitest process without fighting over the port.
const PORT = 19998;
const BASE_URL = `http://localhost:${PORT}`;

let server: WebflowMockServer;
let client: WebflowClient;

beforeAll(async () => {
  server = new WebflowMockServer();
  registerWebflowRoutes(server);
  await server.start(PORT);

  client = new WebflowClient({ accessToken: 'mock-token', baseUrl: BASE_URL });
});

afterAll(async () => {
  await server.stop();
});

beforeEach(() => {
  resetWebflowState();
  server.clearRequests();
});

const mockClass: PublishableClass = {
  id: 'class-race',
  name: 'Stained Glass - TryIt Class',
  description: 'One-session stained glass class for beginners.',
  sessions: [{ dateTime: new Date('2099-10-07T22:00:00.000Z') }],
  durationMinutes: 180,
  capacity: 8,
  priceCents: 6000,
  skillLevel: 'beginner',
  status: 'published',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
} as PublishableClass;

/** Every item in the collection carrying this firebase-id. */
async function itemsForFirebaseId(firebaseId: string): Promise<unknown[]> {
  const res = await fetch(
    `${BASE_URL}/collections/${CLASSES_COLLECTION}/items`
  );
  const body = (await res.json()) as {
    items: { fieldData: Record<string, unknown> }[];
  };
  return body.items.filter((i) => i.fieldData['firebase-id'] === firebaseId);
}

function createRequestCount(): number {
  return server
    .getRequests(`/collections/${CLASSES_COLLECTION}/items`)
    .filter((r) => r.method === 'POST').length;
}

describe('class identity contract — one class, one CMS item', () => {
  const service = () => new ClassService(client, CLASSES_COLLECTION);

  /**
   * The production race, reproduced. Two syncs for one class, started together
   * — which is what happens when the Square id write-back re-fires
   * `syncClassToWebflow` while the original publish is still in flight, and
   * what happens when `syncClassToWebflow` and `syncRegistrationCount` (two
   * separate Cloud Run services, so `maxInstances: 1` does not serialize them)
   * both run for the same class.
   *
   * Neither call is given `existingWebflowItemId`, because in the real failure
   * neither had one yet: the first invocation had not written it back.
   */
  it('creates exactly one item when two syncs race for the same class', async () => {
    await Promise.all([
      service().syncClass({ classEntity: mockClass, registrationCount: 0 }),
      service().syncClass({ classEntity: mockClass, registrationCount: 0 }),
    ]);

    const items = await itemsForFirebaseId(mockClass.id);
    expect(
      items,
      `Two concurrent syncs produced ${items.length} CMS items for one class. ` +
        `Webflow does not enforce uniqueness on firebase-id, so the only thing ` +
        `that can is syncClass. The orphaned item is never updated again and ` +
        `will advertise a stale spot count on the live site forever.`
    ).toHaveLength(1);
    expect(createRequestCount()).toBe(1);
  });

  /**
   * The same invariant under the second trigger of the race: one sync already
   * created the item but its id has not been written back yet (which is
   * `syncRegistrationCount`'s permanent state — it never writes one back), so
   * the next sync arrives with no `existingWebflowItemId` and must ADOPT the
   * existing item by firebase-id rather than create a second one.
   */
  it('adopts the existing item when a later sync has no known item id', async () => {
    await service().syncClass({ classEntity: mockClass, registrationCount: 0 });
    await service().syncClass({ classEntity: mockClass, registrationCount: 2 });

    expect(await itemsForFirebaseId(mockClass.id)).toHaveLength(1);
    expect(createRequestCount()).toBe(1);
  });

  /**
   * A transient Webflow failure must never be laundered into "this class has
   * no item", because that routes straight to the create branch.
   * `getItemById` and `findByFirebaseId` both `return null` on ANY exception,
   * so today a 500 during a burst mints a duplicate rather than aborting.
   *
   * The item genuinely exists here — it is created first — so a create is
   * unambiguously wrong. Only the lookup is made to fail.
   */
  it('refuses to create when the item lookup fails, rather than treating it as absent', async () => {
    await service().syncClass({ classEntity: mockClass, registrationCount: 0 });
    server.clearRequests();

    // Several, not one: the Webflow SDK retries 5xx internally, so a single
    // injected failure is absorbed by the retry and never reaches the code
    // under test. This is also the honest production shape of bug B — a lone
    // blip gets retried away, and it takes a sustained failure or a 429 to
    // reach the create branch.
    failNextWebflowLookups(500, 5);

    await expect(
      service().syncClass({ classEntity: mockClass, registrationCount: 1 })
    ).rejects.toThrow();

    // Disarm whatever the retries did not consume, or the leftovers answer
    // the verification requests below instead of the collection.
    clearWebflowLookupFailures();

    expect(
      createRequestCount(),
      'A failed lookup must not route to createItem. getItemById and ' +
        'findByFirebaseId both return null inside a bare catch, so a 429 or a ' +
        '500 is indistinguishable from "no such item" — and one flaky request ' +
        'during a burst becomes a permanent duplicate CMS item.'
    ).toBe(0);
    expect(await itemsForFirebaseId(mockClass.id)).toHaveLength(1);
  });
});
