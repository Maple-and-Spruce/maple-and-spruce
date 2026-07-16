/**
 * Integration tests for the MT semester admin functions (maple-core, no Square):
 * get/create/update. Exercises auth guards, validation, and the create→read
 * round-trip against the real functions in the emulator.
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
  CreateMusicTogetherSemesterRequest,
  CreateMusicTogetherSemesterResponse,
  GetMusicTogetherSemestersResponse,
  UpdateMusicTogetherSemesterResponse,
} from '@maple/ts/firebase/api-types';

function createInput(
  overrides: Partial<CreateMusicTogetherSemesterRequest> = {}
): CreateMusicTogetherSemesterRequest {
  return {
    name: 'Fall 2026',
    season: 'fall',
    year: 2026,
    weeks: 10,
    ...overrides,
  };
}

describe('MT semester admin CRUD', () => {
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

  it('creates a semester (admin), round-trips through the list', async () => {
    const created = await callFunction<
      CreateMusicTogetherSemesterRequest,
      CreateMusicTogetherSemesterResponse
    >({
      functionName: 'createMusicTogetherSemester',
      data: createInput(),
      idToken: admin.idToken,
    });

    expect(created.status).toBe(200);
    expect(created.data?.semester.id).toBeDefined();
    expect(created.data?.semester.name).toBe('Fall 2026');
    expect(created.data?.semester.season).toBe('fall');
    createdId = created.data!.semester.id;

    const list = await callFunction<
      Record<string, never>,
      GetMusicTogetherSemestersResponse
    >({
      functionName: 'getMusicTogetherSemesters',
      data: {},
      idToken: admin.idToken,
    });
    expect(list.status).toBe(200);
    expect(list.data?.semesters.some((s) => s.id === createdId)).toBe(true);
  });

  it('updates a semester (admin)', async () => {
    const updated = await callFunction<
      { id: string; notes: string },
      UpdateMusicTogetherSemesterResponse
    >({
      functionName: 'updateMusicTogetherSemester',
      data: { id: createdId, notes: 'Enrollment opens mid-August.' },
      idToken: admin.idToken,
    });
    expect(updated.status).toBe(200);
    expect(updated.data?.semester.notes).toBe('Enrollment opens mid-August.');
  });

  it('rejects create for a non-admin', async () => {
    const result = await callFunction<CreateMusicTogetherSemesterRequest>({
      functionName: 'createMusicTogetherSemester',
      data: createInput(),
      idToken: nonAdmin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects create for an unauthenticated caller', async () => {
    const result = await callFunction<CreateMusicTogetherSemesterRequest>({
      functionName: 'createMusicTogetherSemester',
      data: createInput(),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects an invalid semester (bad season)', async () => {
    const result = await callFunction<CreateMusicTogetherSemesterRequest>({
      functionName: 'createMusicTogetherSemester',
      data: createInput({ season: 'autumn' as never }),
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('404s an update to an unknown semester', async () => {
    const result = await callFunction<{ id: string; name: string }>({
      functionName: 'updateMusicTogetherSemester',
      data: { id: 'does-not-exist', name: 'X' },
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });
});
