/**
 * Integration tests for the syncMusicTogetherRegistrationCount Firestore
 * trigger (maple-sync).
 *
 * Locks in the user-facing contract that was broken before this function
 * existed: a family registering must move the number on the public Music
 * Together card, without anyone re-saving the section in admin.
 *
 * The trigger runs in the Firebase emulator and calls the Webflow SDK, which
 * is redirected to the Webflow mock server via WEBFLOW_BASE_URL — so these
 * assert on the `fieldData` actually sent to the CMS, not just on Firestore.
 *
 * NOTE: requires the maple-sync codebase built and loaded in the emulator,
 * plus the WEBFLOW_* params in the emulator environment (`.env.dev`). The mock
 * server doesn't validate tokens, so any non-empty value works.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  deleteFirestoreDoc,
  EMULATOR_CONFIG,
} from '@maple/firebase/integration-test-utils';

/**
 * The Webflow MT Sections collection ID. Mirrors
 * `WEBFLOW_MT_SECTIONS_COLLECTION_ID` in `.env.dev`, which the function
 * process reads from `dist/apps/functions-sync/.env`. The mock server stores
 * items under this exact ID, so the test can fetch them back.
 */
const WEBFLOW_MT_SECTIONS_COLLECTION_ID = '6a4b1b50a5bee79d95d73b25';

interface WebflowMockItem {
  id: string;
  fieldData: Record<string, unknown>;
}

async function findMockItemByFirebaseId(
  sectionId: string
): Promise<WebflowMockItem | undefined> {
  const url = `${EMULATOR_CONFIG.webflowMockServerUrl}/collections/${WEBFLOW_MT_SECTIONS_COLLECTION_ID}/items`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Webflow mock server returned ${res.status}: ${await res.text()}`
    );
  }
  const body = (await res.json()) as { items: WebflowMockItem[] };
  return body.items.find((item) => item.fieldData['firebase-id'] === sectionId);
}

/**
 * Poll the mock server until the synced item reports the expected spot count,
 * so the test isn't pinned to a fixed trigger latency.
 */
async function waitForSpotsRemaining(
  sectionId: string,
  expected: number,
  timeoutMs = 15_000
): Promise<WebflowMockItem> {
  const deadline = Date.now() + timeoutMs;
  let last: WebflowMockItem | undefined;
  while (Date.now() < deadline) {
    last = await findMockItemByFirebaseId(sectionId);
    if (last && last.fieldData['spots-remaining'] === expected) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Timed out waiting for section ${sectionId} to report ${expected} spots remaining. ` +
      `Last seen: ${JSON.stringify(last?.fieldData ?? null)}`
  );
}

const week1 = new Date(Date.now() + 7 * 86_400_000);

function sectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Count Sync — Thursday Morning',
    sessions: [{ dateTime: week1 }],
    capacityFamilies: 8,
    priceFullCents: 25200,
    visible: true,
    enrollmentActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function registrationDoc(
  sectionId: string,
  email: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    sectionId,
    parentNames: ['Family'],
    children: [{ name: 'Kid', dob: new Date('2023-01-01') }],
    email,
    phone: '1',
    address: 'a',
    paymentPlan: 'full',
    policiesAcceptedAt: new Date(),
    pricePaidCents: 25200,
    status: 'confirmed',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('syncMusicTogetherRegistrationCount trigger', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  afterAll(async () => {
    await clearFirestoreEmulator();
  });

  it('drops the public spot count when a family registers', async () => {
    const sectionId = 'mt-count-sec-1';
    await setFirestoreDoc('musicTogetherSections', sectionId, sectionDoc());

    // The section trigger publishes the empty section first.
    const initial = await waitForSpotsRemaining(sectionId, 8);
    expect(initial.fieldData['spots-display']).toBe('8 spots left');
    expect(initial.fieldData['status']).toBe('open');

    // A registration alone — nothing touches the section document.
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'mt-count-reg-1',
      registrationDoc(sectionId, 'one@test.com')
    );

    const afterOne = await waitForSpotsRemaining(sectionId, 7);
    expect(afterOne.fieldData['spots-display']).toBe('7 spots left');
    expect(afterOne.fieldData['status']).toBe('open');
  });

  it('gives the spot back when a registration is cancelled', async () => {
    const sectionId = 'mt-count-sec-2';
    await setFirestoreDoc('musicTogetherSections', sectionId, sectionDoc());
    await waitForSpotsRemaining(sectionId, 8);

    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'mt-count-reg-2',
      registrationDoc(sectionId, 'two@test.com')
    );
    await waitForSpotsRemaining(sectionId, 7);

    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'mt-count-reg-2',
      registrationDoc(sectionId, 'two@test.com', { status: 'cancelled' })
    );

    const restored = await waitForSpotsRemaining(sectionId, 8);
    expect(restored.fieldData['spots-display']).toBe('8 spots left');
  });

  it('gives the spot back when a registration is deleted', async () => {
    const sectionId = 'mt-count-sec-3';
    await setFirestoreDoc('musicTogetherSections', sectionId, sectionDoc());
    await waitForSpotsRemaining(sectionId, 8);

    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'mt-count-reg-3',
      registrationDoc(sectionId, 'three@test.com')
    );
    await waitForSpotsRemaining(sectionId, 7);

    await deleteFirestoreDoc('musicTogetherRegistrations', 'mt-count-reg-3');

    await waitForSpotsRemaining(sectionId, 8);
  });

  it('flips the card to Full when the last spot goes', async () => {
    const sectionId = 'mt-count-sec-full';
    await setFirestoreDoc(
      'musicTogetherSections',
      sectionId,
      sectionDoc({ name: 'Count Sync — Tiny', capacityFamilies: 1 })
    );
    await waitForSpotsRemaining(sectionId, 1);

    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'mt-count-reg-full',
      registrationDoc(sectionId, 'full@test.com')
    );

    const full = await waitForSpotsRemaining(sectionId, 0);
    expect(full.fieldData['spots-display']).toBe('Full');
    expect(full.fieldData['status']).toBe('full');
  });

  it('does not create a CMS item for a hidden section', async () => {
    const sectionId = 'mt-count-sec-hidden';
    await setFirestoreDoc(
      'musicTogetherSections',
      sectionId,
      sectionDoc({ visible: false })
    );
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'mt-count-reg-hidden',
      registrationDoc(sectionId, 'hidden@test.com')
    );

    // Give both triggers time to run, then assert nothing was published.
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(await findMockItemByFirebaseId(sectionId)).toBeUndefined();
  });
});
