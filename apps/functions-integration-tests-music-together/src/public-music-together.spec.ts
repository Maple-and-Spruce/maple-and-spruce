/**
 * Integration tests for the public MT read + waitlist functions
 * (getPublicMusicTogetherSection, addToMusicTogetherWaitlist — maple-core,
 * no auth). Runs the real functions in the emulator; no Square involved.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
} from '@maple/firebase/integration-test-utils';
import type {
  GetPublicMusicTogetherSectionRequest,
  GetPublicMusicTogetherSectionResponse,
  AddToMusicTogetherWaitlistRequest,
  AddToMusicTogetherWaitlistResponse,
} from '@maple/ts/firebase/api-types';

const week1 = new Date(Date.now() + 7 * 86_400_000);
const week5 = new Date(Date.now() + 35 * 86_400_000);

function sectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Public Section',
    sessions: [{ dateTime: week1 }],
    capacityFamilies: 8,
    priceFullCents: 25200,
    installmentPlan: [
      { amountCents: 13200, dueAt: week1 },
      { amountCents: 13200, dueAt: week5 },
    ],
    visible: true,
    enrollmentActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function confirmedReg(sectionId: string, email: string) {
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
  };
}

describe('getPublicMusicTogetherSection', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    await setFirestoreDoc('musicTogetherSections', 'sec-pub', sectionDoc());
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-pub-draft',
      sectionDoc({ visible: false })
    );
    // two confirmed families → 6 of 8 spots remaining
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'pub-reg-1',
      confirmedReg('sec-pub', 'a@test.com')
    );
    await setFirestoreDoc(
      'musicTogetherRegistrations',
      'pub-reg-2',
      confirmedReg('sec-pub', 'b@test.com')
    );
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('returns the public projection with computed spotsRemaining + ISO dates', async () => {
    const result = await callFunction<
      GetPublicMusicTogetherSectionRequest,
      GetPublicMusicTogetherSectionResponse
    >({
      functionName: 'getPublicMusicTogetherSection',
      data: { sectionId: 'sec-pub' },
    });

    expect(result.status).toBe(200);
    const section = result.data!.section;
    expect(section.id).toBe('sec-pub');
    expect(section.priceFullCents).toBe(25200);
    expect(section.spotsRemaining).toBe(6); // 8 - 2 confirmed
    expect(section.installmentPlan).toHaveLength(2);
    expect(typeof section.sessions[0].dateTime).toBe('string'); // serialized ISO
  });

  it('hides draft sections', async () => {
    const result = await callFunction<GetPublicMusicTogetherSectionRequest>({
      functionName: 'getPublicMusicTogetherSection',
      data: { sectionId: 'sec-pub-draft' },
    });
    expect(result.status).not.toBe(200);
  });

  it('404s an unknown section', async () => {
    const result = await callFunction<GetPublicMusicTogetherSectionRequest>({
      functionName: 'getPublicMusicTogetherSection',
      data: { sectionId: 'nope' },
    });
    expect(result.status).not.toBe(200);
  });
});

describe('addToMusicTogetherWaitlist', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-wl',
      sectionDoc({ enrollmentActive: false })
    );
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-wl-draft',
      sectionDoc({ visible: false })
    );
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('adds a family and persists the waitlist entry', async () => {
    const result = await callFunction<
      AddToMusicTogetherWaitlistRequest,
      AddToMusicTogetherWaitlistResponse
    >({
      functionName: 'addToMusicTogetherWaitlist',
      data: {
        sectionId: 'sec-wl',
        name: 'Wait Family',
        email: 'Wait@test.com',
        availability: 'Tuesday mornings',
      },
    });

    expect(result.status).toBe(200);
    expect(result.data?.added).toBe(true);

    // stored under the section's waitlist subcollection, keyed by lowercased email
    const entry = await getFirestoreDoc(
      'musicTogetherSections/sec-wl/waitlist',
      'wait@test.com'
    );
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe('Wait Family');
    expect(entry?.availability).toBe('Tuesday mornings');
  });

  it('is idempotent — a repeat email reports added=false', async () => {
    const result = await callFunction<
      AddToMusicTogetherWaitlistRequest,
      AddToMusicTogetherWaitlistResponse
    >({
      functionName: 'addToMusicTogetherWaitlist',
      data: { sectionId: 'sec-wl', name: 'Wait Family', email: 'wait@test.com' },
    });
    expect(result.status).toBe(200);
    expect(result.data?.added).toBe(false);
  });

  it('rejects a draft section', async () => {
    const result = await callFunction<AddToMusicTogetherWaitlistRequest>({
      functionName: 'addToMusicTogetherWaitlist',
      data: { sectionId: 'sec-wl-draft', name: 'X', email: 'x@test.com' },
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects an invalid email', async () => {
    const result = await callFunction<AddToMusicTogetherWaitlistRequest>({
      functionName: 'addToMusicTogetherWaitlist',
      data: { sectionId: 'sec-wl', name: 'X', email: 'not-an-email' },
    });
    expect(result.status).not.toBe(200);
  });
});
