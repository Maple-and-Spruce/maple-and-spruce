/**
 * Integration tests for the MT admin functions (maple-core, no Square):
 * section CRUD (get/create/update) and the roster read. Exercises auth guards,
 * validation, the create→read round-trip, and roster grouping + past-due.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  callFunction,
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import type {
  CreateMusicTogetherSectionRequest,
  CreateMusicTogetherSectionResponse,
  GetMusicTogetherSectionsResponse,
  UpdateMusicTogetherSectionResponse,
  GetMusicTogetherRosterRequest,
  GetMusicTogetherRosterResponse,
} from '@maple/ts/firebase/api-types';

const week1 = new Date(Date.now() + 7 * 86_400_000);
const week5 = new Date(Date.now() + 35 * 86_400_000);

function createInput(
  overrides: Partial<CreateMusicTogetherSectionRequest> = {}
): CreateMusicTogetherSectionRequest {
  return {
    name: 'Created Section',
    sessions: [{ dateTime: week1 }],
    capacityFamilies: 8,
    priceFullCents: 25200,
    installmentPlan: [
      { amountCents: 13200, dueAt: week1 },
      { amountCents: 13200, dueAt: week5 },
    ],
    status: 'open',
    ...overrides,
  };
}

describe('MT section admin CRUD', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  let createdId: string;

  it('creates a section (admin), round-trips through the list', async () => {
    const created = await callFunction<
      CreateMusicTogetherSectionRequest,
      CreateMusicTogetherSectionResponse
    >({
      functionName: 'createMusicTogetherSection',
      data: createInput(),
      idToken: admin.idToken,
    });

    expect(created.status).toBe(200);
    expect(created.data?.section.id).toBeDefined();
    expect(created.data?.section.name).toBe('Created Section');
    createdId = created.data!.section.id;

    const list = await callFunction<
      Record<string, never>,
      GetMusicTogetherSectionsResponse
    >({
      functionName: 'getMusicTogetherSections',
      data: {},
      idToken: admin.idToken,
    });
    expect(list.status).toBe(200);
    expect(list.data?.sections.some((s) => s.id === createdId)).toBe(true);
  });

  it('updates a section (admin)', async () => {
    const updated = await callFunction<
      { id: string; name: string },
      UpdateMusicTogetherSectionResponse
    >({
      functionName: 'updateMusicTogetherSection',
      data: { id: createdId, name: 'Renamed Section' },
      idToken: admin.idToken,
    });
    expect(updated.status).toBe(200);
    expect(updated.data?.section.name).toBe('Renamed Section');
  });

  it('rejects create for a non-admin', async () => {
    const result = await callFunction<CreateMusicTogetherSectionRequest>({
      functionName: 'createMusicTogetherSection',
      data: createInput(),
      idToken: nonAdmin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects create for an unauthenticated caller', async () => {
    const result = await callFunction<CreateMusicTogetherSectionRequest>({
      functionName: 'createMusicTogetherSection',
      data: createInput(),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects an invalid section (blank name)', async () => {
    const result = await callFunction<CreateMusicTogetherSectionRequest>({
      functionName: 'createMusicTogetherSection',
      data: createInput({ name: '' }),
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('404s an update to an unknown section', async () => {
    const result = await callFunction<{ id: string; name: string }>({
      functionName: 'updateMusicTogetherSection',
      data: { id: 'does-not-exist', name: 'X' },
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });
});

describe('getMusicTogetherRoster', () => {
  let admin: TestUser;
  let nonAdmin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdmin = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });

    await setFirestoreDoc('musicTogetherSections', 'sec-roster', {
      name: 'Roster Section',
      sessions: [{ dateTime: week1 }],
      capacityFamilies: 8,
      priceFullCents: 25200,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    // Two families; one has a failed scheduled charge → past due.
    for (const [id, email] of [
      ['reg-a', 'a@test.com'],
      ['reg-b', 'b@test.com'],
    ]) {
      await setFirestoreDoc('musicTogetherRegistrations', id, {
        sectionId: 'sec-roster',
        parentNames: ['Fam ' + id],
        children: [{ name: 'Kid', dob: new Date('2023-01-01') }],
        email,
        phone: '1',
        address: 'a',
        paymentPlan: 'installments',
        policiesAcceptedAt: new Date(),
        pricePaidCents: 13200,
        status: 'confirmed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    await setFirestoreDoc('musicTogetherScheduledCharges', 'chg-failed', {
      registrationId: 'reg-b',
      sectionId: 'sec-roster',
      installmentNumber: 2,
      amountCents: 13200,
      dueAt: week5,
      status: 'failed',
      lastError: 'card declined',
      idempotencyKey: 'mt-charge-b',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('returns the roster with grouped charges + past-due flag (admin)', async () => {
    const result = await callFunction<
      GetMusicTogetherRosterRequest,
      GetMusicTogetherRosterResponse
    >({
      functionName: 'getMusicTogetherRoster',
      data: { sectionId: 'sec-roster' },
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    expect(result.data?.entries).toHaveLength(2);
    const regB = result.data!.entries.find(
      (e) => e.registration.id === 'reg-b'
    )!;
    const regA = result.data!.entries.find(
      (e) => e.registration.id === 'reg-a'
    )!;
    expect(regB.pastDue).toBe(true);
    expect(regB.charges).toHaveLength(1);
    expect(regA.pastDue).toBe(false);
  });

  it('rejects a non-admin caller', async () => {
    const result = await callFunction<GetMusicTogetherRosterRequest>({
      functionName: 'getMusicTogetherRoster',
      data: { sectionId: 'sec-roster' },
      idToken: nonAdmin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('404s an unknown section', async () => {
    const result = await callFunction<GetMusicTogetherRosterRequest>({
      functionName: 'getMusicTogetherRoster',
      data: { sectionId: 'nope' },
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });
});
