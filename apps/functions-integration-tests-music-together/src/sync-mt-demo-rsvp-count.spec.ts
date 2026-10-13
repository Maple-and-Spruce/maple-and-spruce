/**
 * Integration tests for the syncMusicTogetherDemoRsvpCount Firestore trigger
 * (maple-sync).
 *
 * Locks in the user-facing contract: a family RSVPing for a free demo class
 * must move the number on the public demo card, without anyone re-saving the
 * demo in admin. Before this trigger, RSVPs (a subcollection the demo sync
 * never sees) left the CMS count at whatever it was at the last demo edit.
 *
 * The trigger runs in the Firebase emulator and calls the Webflow SDK, which
 * is redirected to the Webflow mock server via WEBFLOW_BASE_URL — so these
 * assert on the `fieldData` actually sent to the CMS, not just on Firestore.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  deleteFirestoreDoc,
  EMULATOR_CONFIG,
  TRIGGER_WAIT_TIMEOUT_MS,
} from '@maple/firebase/integration-test-utils';

/**
 * The Webflow MT Demos collection ID. Mirrors
 * `WEBFLOW_MT_DEMOS_COLLECTION_ID` in `.env.dev`, which the function process
 * reads from `dist/apps/functions-sync/.env`.
 */
const WEBFLOW_MT_DEMOS_COLLECTION_ID = '6a6fa4cea767e5e2485daae2';

interface WebflowMockItem {
  id: string;
  fieldData: Record<string, unknown>;
}

async function findMockItemByFirebaseId(
  demoId: string
): Promise<WebflowMockItem | undefined> {
  const url = `${EMULATOR_CONFIG.webflowMockServerUrl}/collections/${WEBFLOW_MT_DEMOS_COLLECTION_ID}/items`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Webflow mock server returned ${res.status}: ${await res.text()}`
    );
  }
  const body = (await res.json()) as { items: WebflowMockItem[] };
  return body.items.find((item) => item.fieldData['firebase-id'] === demoId);
}

/**
 * Poll the mock server until the synced item reports the expected spot count,
 * so the test isn't pinned to a fixed trigger latency.
 */
async function waitForSpotsRemaining(
  demoId: string,
  expected: number,
  timeoutMs = TRIGGER_WAIT_TIMEOUT_MS
): Promise<WebflowMockItem> {
  const deadline = Date.now() + timeoutMs;
  let last: WebflowMockItem | undefined;
  while (Date.now() < deadline) {
    last = await findMockItemByFirebaseId(demoId);
    if (last && last.fieldData['spots-remaining'] === expected) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Timed out waiting for demo ${demoId} to report ${expected} spots remaining. ` +
      `Last seen: ${JSON.stringify(last?.fieldData ?? null)}`
  );
}

const nextWeek = new Date(Date.now() + 7 * 86_400_000);

function demoDoc(overrides: Record<string, unknown> = {}) {
  return {
    dateTime: nextWeek,
    location: 'Count Sync Library',
    capacityFamilies: 3,
    visible: true,
    createdAt: new Date(),
    ...overrides,
  };
}

function rsvpPath(demoId: string): string {
  return `musicTogetherDemos/${demoId}/rsvps`;
}

function rsvpDoc(
  demoId: string,
  email: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    demoId,
    name: 'Test Family',
    email,
    status: 'confirmed',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('syncMusicTogetherDemoRsvpCount trigger', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  it('drops the public spot count when a family RSVPs', async () => {
    const demoId = 'mt-demo-count-1';
    await setFirestoreDoc('musicTogetherDemos', demoId, demoDoc());

    // The demo trigger publishes the empty demo first.
    const initial = await waitForSpotsRemaining(demoId, 3);
    expect(initial.fieldData['spots-display']).toBe('3 spots left');

    // An RSVP alone — nothing touches the demo document.
    await setFirestoreDoc(
      rsvpPath(demoId),
      'one-test-com',
      rsvpDoc(demoId, 'one@test.com')
    );

    const afterOne = await waitForSpotsRemaining(demoId, 2);
    expect(afterOne.fieldData['spots-display']).toBe('2 spots left');
  });

  it('does not count a waitlisted RSVP', async () => {
    const demoId = 'mt-demo-count-2';
    await setFirestoreDoc('musicTogetherDemos', demoId, demoDoc());
    await waitForSpotsRemaining(demoId, 3);

    await setFirestoreDoc(
      rsvpPath(demoId),
      'confirmed-test-com',
      rsvpDoc(demoId, 'confirmed@test.com')
    );
    await setFirestoreDoc(
      rsvpPath(demoId),
      'waitlisted-test-com',
      rsvpDoc(demoId, 'waitlisted@test.com', { status: 'waitlisted' })
    );

    await waitForSpotsRemaining(demoId, 2);
    // Settle, then confirm the waitlisted write did not take a second spot.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect((await findMockItemByFirebaseId(demoId))?.fieldData['spots-remaining']).toBe(2);
  });

  it('gives the spot back when an RSVP is deleted', async () => {
    const demoId = 'mt-demo-count-3';
    await setFirestoreDoc('musicTogetherDemos', demoId, demoDoc());
    await waitForSpotsRemaining(demoId, 3);

    await setFirestoreDoc(
      rsvpPath(demoId),
      'three-test-com',
      rsvpDoc(demoId, 'three@test.com')
    );
    await waitForSpotsRemaining(demoId, 2);

    await deleteFirestoreDoc(rsvpPath(demoId), 'three-test-com');

    await waitForSpotsRemaining(demoId, 3);
  });

  it('shows Full when the last spot goes', async () => {
    const demoId = 'mt-demo-count-full';
    await setFirestoreDoc(
      'musicTogetherDemos',
      demoId,
      demoDoc({ capacityFamilies: 1 })
    );
    await waitForSpotsRemaining(demoId, 1);

    await setFirestoreDoc(
      rsvpPath(demoId),
      'full-test-com',
      rsvpDoc(demoId, 'full@test.com')
    );

    const full = await waitForSpotsRemaining(demoId, 0);
    expect(full.fieldData['spots-display']).toBe('Full');
  });

  it('does not create a CMS item for a hidden demo', async () => {
    const demoId = 'mt-demo-count-hidden';
    await setFirestoreDoc(
      'musicTogetherDemos',
      demoId,
      demoDoc({ visible: false })
    );
    await setFirestoreDoc(
      rsvpPath(demoId),
      'hidden-test-com',
      rsvpDoc(demoId, 'hidden@test.com')
    );

    // Give both triggers time to run, then assert nothing was published.
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(await findMockItemByFirebaseId(demoId)).toBeUndefined();
  });
});
