/**
 * Integration tests for the cross-section interest list (maple-core, no
 * Square): the public submit (addMusicTogetherInterest), the public section
 * options list (getPublicMusicTogetherSections), and the admin demand read
 * (getMusicTogetherInterest). Runs the real functions in the emulator.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  GetPublicMusicTogetherSectionsResponse,
  AddMusicTogetherInterestRequest,
  AddMusicTogetherInterestResponse,
  GetMusicTogetherInterestResponse,
} from '@maple/ts/firebase/api-types';

const week1 = new Date(Date.now() + 7 * 86_400_000);

function sectionDoc(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Interest Section',
    sessions: [{ dateTime: week1 }],
    firstSessionAt: week1,
    capacityFamilies: 8,
    priceFullCents: 25200,
    visible: true,
    enrollmentActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Music Together interest list', () => {
  let admin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-thu',
      sectionDoc({ name: 'Thursdays 10am' })
    );
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-sat',
      sectionDoc({ name: 'Saturdays 9am' })
    );
    await setFirestoreDoc(
      'musicTogetherSections',
      'sec-hidden',
      sectionDoc({ name: 'Hidden', visible: false })
    );
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('lists only visible sections for the interest checkboxes', async () => {
    const result = await callFunction<
      Record<string, never>,
      GetPublicMusicTogetherSectionsResponse
    >({ functionName: 'getPublicMusicTogetherSections', data: {} });

    expect(result.status).toBe(200);
    const ids = result.data!.sections.map((s) => s.id).sort();
    expect(ids).toEqual(['sec-sat', 'sec-thu']);
    const thu = result.data!.sections.find((s) => s.id === 'sec-thu');
    expect(typeof thu?.firstSessionAt).toBe('string');
  });

  it('submits an interest entry and persists the multi-section + preference fields', async () => {
    const result = await callFunction<
      AddMusicTogetherInterestRequest,
      AddMusicTogetherInterestResponse
    >({
      functionName: 'addMusicTogetherInterest',
      data: {
        name: 'Interest Family',
        email: 'Interest@Test.com',
        interestedSectionIds: ['sec-thu', 'sec-sat'],
        preferenceNote: 'Thursdays if I had to pick',
        alternateTimesNote: 'Weekday afternoons also work',
        notes: 'Two children, ages 2 and 4',
      },
    });

    expect(result.status).toBe(200);
    expect(result.data?.added).toBe(true);

    // Stored top-level, keyed by lowercased email.
    const entry = await getFirestoreDoc(
      'musicTogetherInterest',
      'interest@test.com'
    );
    expect(entry).not.toBeNull();
    expect(entry?.name).toBe('Interest Family');
    expect(entry?.interestedSectionIds).toEqual(['sec-thu', 'sec-sat']);
    expect(entry?.preferenceNote).toBe('Thursdays if I had to pick');
    expect(entry?.alternateTimesNote).toBe('Weekday afternoons also work');
    expect(entry?.notes).toBe('Two children, ages 2 and 4');
  });

  it('is idempotent per email — a repeat submission updates and reports added=false', async () => {
    const result = await callFunction<
      AddMusicTogetherInterestRequest,
      AddMusicTogetherInterestResponse
    >({
      functionName: 'addMusicTogetherInterest',
      data: {
        name: 'Interest Family',
        email: 'interest@test.com',
        interestedSectionIds: ['sec-thu'],
      },
    });
    expect(result.status).toBe(200);
    expect(result.data?.added).toBe(false);

    const entry = await getFirestoreDoc(
      'musicTogetherInterest',
      'interest@test.com'
    );
    // Selections were replaced with the latest submission.
    expect(entry?.interestedSectionIds).toEqual(['sec-thu']);
  });

  it('rejects a hidden section', async () => {
    const result = await callFunction<AddMusicTogetherInterestRequest>({
      functionName: 'addMusicTogetherInterest',
      data: {
        name: 'X',
        email: 'x@test.com',
        interestedSectionIds: ['sec-hidden'],
      },
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects an entirely blank interest signal', async () => {
    const result = await callFunction<AddMusicTogetherInterestRequest>({
      functionName: 'addMusicTogetherInterest',
      data: { name: 'X', email: 'blank@test.com', interestedSectionIds: [] },
    });
    expect(result.status).not.toBe(200);
  });

  it('admin read returns entries + a per-section demand tally', async () => {
    // A second family, interested only in Thursdays.
    await callFunction<AddMusicTogetherInterestRequest>({
      functionName: 'addMusicTogetherInterest',
      data: {
        name: 'Second Family',
        email: 'second@test.com',
        interestedSectionIds: ['sec-thu'],
      },
    });

    const result = await callFunction<
      Record<string, never>,
      GetMusicTogetherInterestResponse
    >({
      functionName: 'getMusicTogetherInterest',
      data: {},
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data!.entries.length).toBeGreaterThanOrEqual(2);
    // sec-thu is checked by both families → highest demand.
    expect(result.data!.demand[0]).toEqual({ sectionId: 'sec-thu', count: 2 });
    expect(result.data!.sectionNames['sec-thu']).toBe('Thursdays 10am');
  });

  it('rejects the admin read without auth', async () => {
    const result = await callFunction<Record<string, never>>({
      functionName: 'getMusicTogetherInterest',
      data: {},
    });
    expect(result.status).not.toBe(200);
  });
});
