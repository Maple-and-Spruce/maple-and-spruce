/**
 * Integration tests for the Music Together demo-class functions (maple-core, no
 * Square — demos are FREE). Runs the real callables + Firestore triggers in the
 * emulator. Demos are the layer where two user-hit bugs lived that unit/
 * interaction tests (which mock the repo/callable) could not catch:
 *
 *  1. A demo created with a BLANK duration (persisted as `null`) was rejected by
 *     validation. Locked by the "blank-duration regression" block below — on the
 *     pre-fix code the `durationMinutes: null` create 400s.
 *  2. (semester array-clear — see music-together-semester.spec.ts.)
 *
 * Covers: admin CRUD round-trip + role gating, the blank-duration regression,
 * the public read projection (visibility/recency filter + no RSVP PII), the
 * capacity→waitlist RSVP flow with idempotency + admin read, and the
 * `onMusicTogetherDemoWrite` calendar trigger (upsert on visible, remove on
 * hide/delete).
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  callFunction,
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import { MT_CLASS_DURATION_MINUTES } from '@maple/ts/domain';
import type {
  CreateMusicTogetherDemoRequest,
  CreateMusicTogetherDemoResponse,
  GetMusicTogetherDemosRequest,
  GetMusicTogetherDemosResponse,
  UpdateMusicTogetherDemoRequest,
  UpdateMusicTogetherDemoResponse,
  DeleteMusicTogetherDemoRequest,
  DeleteMusicTogetherDemoResponse,
  GetPublicMusicTogetherDemosRequest,
  GetPublicMusicTogetherDemosResponse,
  AddMusicTogetherDemoRsvpRequest,
  AddMusicTogetherDemoRsvpResponse,
  GetMusicTogetherDemoRsvpsRequest,
  GetMusicTogetherDemoRsvpsResponse,
} from '@maple/ts/firebase/api-types';

const soon = new Date(Date.now() + 7 * 86_400_000);
const past = new Date(Date.now() - 7 * 86_400_000);

function createInput(
  overrides: Partial<CreateMusicTogetherDemoRequest> = {}
): CreateMusicTogetherDemoRequest {
  return {
    dateTime: soon,
    location: 'Morgantown Public Library',
    capacityFamilies: 8,
    durationMinutes: 45,
    visible: true,
    ...overrides,
  };
}

/**
 * Poll Firestore until a calendar event doc reaches the expected presence
 * (present=true → appears, present=false → removed). Firestore triggers in the
 * emulator are async, so we retry with a bounded timeout instead of a fixed
 * sleep.
 */
async function waitForCalendarEvent(
  eventId: string,
  present: boolean,
  timeoutMs = 10_000
): Promise<Record<string, unknown> | null> {
  const start = Date.now();
  let doc = await getFirestoreDoc('calendarEvents', eventId);
  while (Boolean(doc) !== present && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    doc = await getFirestoreDoc('calendarEvents', eventId);
  }
  return doc;
}

describe('MT demo admin CRUD', () => {
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

  it('creates a demo (admin), round-trips through the list', async () => {
    const created = await callFunction<
      CreateMusicTogetherDemoRequest,
      CreateMusicTogetherDemoResponse
    >({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: 'Created Library', notes: 'bring a shaker' }),
      idToken: admin.idToken,
    });

    expect(created.status).toBe(200);
    expect(created.data?.demo.id).toBeDefined();
    expect(created.data?.demo.location).toBe('Created Library');
    expect(created.data?.demo.notes).toBe('bring a shaker');
    createdId = created.data!.demo.id;

    const list = await callFunction<
      GetMusicTogetherDemosRequest,
      GetMusicTogetherDemosResponse
    >({
      functionName: 'getMusicTogetherDemos',
      data: {},
      idToken: admin.idToken,
    });
    expect(list.status).toBe(200);
    expect(list.data?.demos.some((d) => d.id === createdId)).toBe(true);
  });

  it('updates a demo (admin), reads back the change', async () => {
    const updated = await callFunction<
      UpdateMusicTogetherDemoRequest,
      UpdateMusicTogetherDemoResponse
    >({
      functionName: 'updateMusicTogetherDemo',
      data: { id: createdId, location: 'Renamed Library', capacityFamilies: 5 },
      idToken: admin.idToken,
    });
    expect(updated.status).toBe(200);
    expect(updated.data?.demo.location).toBe('Renamed Library');
    expect(updated.data?.demo.capacityFamilies).toBe(5);

    const list = await callFunction<
      GetMusicTogetherDemosRequest,
      GetMusicTogetherDemosResponse
    >({
      functionName: 'getMusicTogetherDemos',
      data: {},
      idToken: admin.idToken,
    });
    const fromList = list.data?.demos.find((d) => d.id === createdId);
    expect(fromList?.location).toBe('Renamed Library');
    expect(fromList?.capacityFamilies).toBe(5);
  });

  it('deletes a demo (admin), gone from the list', async () => {
    const deleted = await callFunction<
      DeleteMusicTogetherDemoRequest,
      DeleteMusicTogetherDemoResponse
    >({
      functionName: 'deleteMusicTogetherDemo',
      data: { id: createdId },
      idToken: admin.idToken,
    });
    expect(deleted.status).toBe(200);
    expect(deleted.data?.deleted).toBe(true);

    const list = await callFunction<
      GetMusicTogetherDemosRequest,
      GetMusicTogetherDemosResponse
    >({
      functionName: 'getMusicTogetherDemos',
      data: {},
      idToken: admin.idToken,
    });
    expect(list.data?.demos.some((d) => d.id === createdId)).toBe(false);
  });

  it('rejects create for a non-admin', async () => {
    const result = await callFunction<CreateMusicTogetherDemoRequest>({
      functionName: 'createMusicTogetherDemo',
      data: createInput(),
      idToken: nonAdmin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects create for an unauthenticated caller', async () => {
    const result = await callFunction<CreateMusicTogetherDemoRequest>({
      functionName: 'createMusicTogetherDemo',
      data: createInput(),
    });
    expect(result.status).not.toBe(200);
  });

  it('rejects a demo with a blank location', async () => {
    const result = await callFunction<CreateMusicTogetherDemoRequest>({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: '' }),
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });

  it('404s an update to an unknown demo', async () => {
    const result = await callFunction<UpdateMusicTogetherDemoRequest>({
      functionName: 'updateMusicTogetherDemo',
      data: { id: 'does-not-exist', location: 'X' },
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });
});

describe('createMusicTogetherDemo blank-duration regression (#714)', () => {
  let admin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('accepts a demo with durationMinutes OMITTED → effective 45', async () => {
    const input = createInput({ location: 'Omitted Duration Library' });
    delete (input as { durationMinutes?: number }).durationMinutes;

    const created = await callFunction<
      CreateMusicTogetherDemoRequest,
      CreateMusicTogetherDemoResponse
    >({
      functionName: 'createMusicTogetherDemo',
      data: input,
      idToken: admin.idToken,
    });
    expect(created.status).toBe(200);
    // Stored value is absent; the effective duration falls back to the default.
    expect(created.data?.demo.durationMinutes ?? null).toBeNull();

    // The public read computes the effective duration (45) via the domain helper.
    const pub = await callFunction<
      GetPublicMusicTogetherDemosRequest,
      GetPublicMusicTogetherDemosResponse
    >({ functionName: 'getPublicMusicTogetherDemos', data: {} });
    const demo = pub.data?.demos.find((d) => d.id === created.data!.demo.id);
    expect(demo?.durationMinutes).toBe(MT_CLASS_DURATION_MINUTES);
  });

  it('accepts a demo with durationMinutes: null → effective 45 (the #714 bug)', async () => {
    const created = await callFunction<
      CreateMusicTogetherDemoRequest,
      CreateMusicTogetherDemoResponse
    >({
      functionName: 'createMusicTogetherDemo',
      // Pre-fix, the Vest guard used a strict `!== undefined`, so this null
      // reached enforce() and the create 400'd.
      data: createInput({
        location: 'Null Duration Library',
        durationMinutes: null as unknown as number,
      }),
      idToken: admin.idToken,
    });
    expect(created.status).toBe(200);
    expect(created.data?.demo.durationMinutes ?? null).toBeNull();

    const pub = await callFunction<
      GetPublicMusicTogetherDemosRequest,
      GetPublicMusicTogetherDemosResponse
    >({ functionName: 'getPublicMusicTogetherDemos', data: {} });
    const demo = pub.data?.demos.find((d) => d.id === created.data!.demo.id);
    expect(demo?.durationMinutes).toBe(MT_CLASS_DURATION_MINUTES);
  });

  it('still rejects durationMinutes: 0 (not a valid duration)', async () => {
    const result = await callFunction<CreateMusicTogetherDemoRequest>({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: 'Zero Duration', durationMinutes: 0 }),
      idToken: admin.idToken,
    });
    expect(result.status).not.toBe(200);
  });
});

describe('getPublicMusicTogetherDemos', () => {
  let admin: TestUser;
  let visibleId: string;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });

    // Upcoming + visible → shown. Capacity 8, one confirmed RSVP → 7 remaining.
    const visible = await callFunction<
      CreateMusicTogetherDemoRequest,
      CreateMusicTogetherDemoResponse
    >({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: 'Visible Upcoming Library' }),
      idToken: admin.idToken,
    });
    visibleId = visible.data!.demo.id;

    // Past + visible → excluded (date filter).
    await callFunction<CreateMusicTogetherDemoRequest>({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: 'Past Library', dateTime: past }),
      idToken: admin.idToken,
    });

    // Upcoming + invisible → excluded (visibility filter).
    await callFunction<CreateMusicTogetherDemoRequest>({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: 'Hidden Library', visible: false }),
      idToken: admin.idToken,
    });

    // A confirmed RSVP with PII that must NOT leak into the public projection.
    await callFunction<
      AddMusicTogetherDemoRsvpRequest,
      AddMusicTogetherDemoRsvpResponse
    >({
      functionName: 'addMusicTogetherDemoRsvp',
      data: {
        demoId: visibleId,
        name: 'Secret Family',
        email: 'secret@test.com',
      },
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('returns only upcoming visible demos with availability, and no RSVP PII', async () => {
    const result = await callFunction<
      GetPublicMusicTogetherDemosRequest,
      GetPublicMusicTogetherDemosResponse
    >({ functionName: 'getPublicMusicTogetherDemos', data: {} });

    expect(result.status).toBe(200);
    const demos = result.data!.demos;
    // Exactly the one upcoming visible demo.
    expect(demos).toHaveLength(1);
    const demo = demos[0];
    expect(demo.id).toBe(visibleId);
    expect(demo.location).toBe('Visible Upcoming Library');
    expect(demo.spotsRemaining).toBe(7); // 8 capacity − 1 confirmed
    expect(demo.isFull).toBe(false);
    expect(typeof demo.dateTime).toBe('string'); // serialized ISO

    // No past / hidden demos leaked.
    expect(demos.some((d) => d.location === 'Past Library')).toBe(false);
    expect(demos.some((d) => d.location === 'Hidden Library')).toBe(false);

    // The public projection carries only customer-safe fields — no RSVP PII.
    expect(Object.keys(demo).sort()).toEqual(
      ['dateTime', 'durationMinutes', 'id', 'isFull', 'location', 'spotsRemaining'].sort()
    );
    const serialized = JSON.stringify(result.data);
    expect(serialized).not.toContain('secret@test.com');
    expect(serialized).not.toContain('Secret Family');
  });
});

describe('addMusicTogetherDemoRsvp capacity → waitlist', () => {
  let admin: TestUser;
  let demoId: string;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });

    const created = await callFunction<
      CreateMusicTogetherDemoRequest,
      CreateMusicTogetherDemoResponse
    >({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: 'RSVP Library', capacityFamilies: 2 }),
      idToken: admin.idToken,
    });
    demoId = created.data!.demo.id;
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  async function rsvp(
    email: string,
    name = 'Family ' + email
  ): Promise<AddMusicTogetherDemoRsvpResponse | undefined> {
    const result = await callFunction<
      AddMusicTogetherDemoRsvpRequest,
      AddMusicTogetherDemoRsvpResponse
    >({
      functionName: 'addMusicTogetherDemoRsvp',
      data: { demoId, name, email },
    });
    expect(result.status).toBe(200);
    return result.data;
  }

  it('confirms up to capacity, then waitlists; re-RSVP is idempotent', async () => {
    // `toMatchObject`, not `toEqual`: the response also carries the Meta
    // `eventId` the widget reuses as the Pixel's dedup key. Its contents are
    // asserted in music-together-top-funnel-conversions.spec.ts; here we only
    // care about capacity and idempotency.
    const first = await rsvp('one@test.com');
    expect(first).toMatchObject({ added: true, status: 'confirmed' });

    const second = await rsvp('two@test.com');
    expect(second).toMatchObject({ added: true, status: 'confirmed' });

    // Third family is over the cap of 2 → waitlisted.
    const third = await rsvp('three@test.com');
    expect(third).toMatchObject({ added: true, status: 'waitlisted' });

    // Re-RSVP the first family → idempotent, keeps its confirmed seat.
    const repeat = await rsvp('one@test.com', 'One Again');
    expect(repeat).toMatchObject({ added: false, status: 'confirmed' });
  });

  it('admin read groups 2 confirmed + 1 waitlisted for the demo', async () => {
    const result = await callFunction<
      GetMusicTogetherDemoRsvpsRequest,
      GetMusicTogetherDemoRsvpsResponse
    >({
      functionName: 'getMusicTogetherDemoRsvps',
      data: {},
      idToken: admin.idToken,
    });

    expect(result.status).toBe(200);
    const group = result.data!.demos.find((g) => g.demo.id === demoId)!;
    expect(group).toBeDefined();
    expect(group.confirmed).toHaveLength(2);
    expect(group.waitlisted).toHaveLength(1);
    expect(group.confirmed.map((r) => r.email).sort()).toEqual([
      'one@test.com',
      'two@test.com',
    ]);
    expect(group.waitlisted[0].email).toBe('three@test.com');
  });

  it('rejects the admin RSVP read for a non-admin', async () => {
    const nonAdmin = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );
    const result = await callFunction<GetMusicTogetherDemoRsvpsRequest>({
      functionName: 'getMusicTogetherDemoRsvps',
      data: {},
      idToken: nonAdmin.idToken,
    });
    expect(result.status).not.toBe(200);
  });
});

describe('onMusicTogetherDemoWrite calendar trigger', () => {
  let admin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('upserts a public calendar event for a visible demo, removed on hide + delete', async () => {
    const created = await callFunction<
      CreateMusicTogetherDemoRequest,
      CreateMusicTogetherDemoResponse
    >({
      functionName: 'createMusicTogetherDemo',
      data: createInput({ location: 'Trigger Library' }),
      idToken: admin.idToken,
    });
    expect(created.status).toBe(200);
    const demoId = created.data!.demo.id;
    const eventId = `mt-demo-${demoId}`;

    // Trigger fires → a public musictogether event appears at the stable id.
    const event = await waitForCalendarEvent(eventId, true);
    expect(event).not.toBeNull();
    expect(event?.type).toBe('musictogether');
    expect(event?.public).toBe(true);
    // Free-text location is carried verbatim (demos are often offsite).
    expect(event?.location).toBe('Trigger Library');
    expect(event?.sourceRef).toBe(`musicTogetherDemos/${demoId}`);

    // Hiding the demo removes the calendar event.
    const hidden = await callFunction<
      UpdateMusicTogetherDemoRequest,
      UpdateMusicTogetherDemoResponse
    >({
      functionName: 'updateMusicTogetherDemo',
      data: { id: demoId, visible: false },
      idToken: admin.idToken,
    });
    expect(hidden.status).toBe(200);
    const afterHide = await waitForCalendarEvent(eventId, false);
    expect(afterHide).toBeNull();

    // Re-showing brings the event back, then deleting removes it for good.
    await callFunction<UpdateMusicTogetherDemoRequest>({
      functionName: 'updateMusicTogetherDemo',
      data: { id: demoId, visible: true },
      idToken: admin.idToken,
    });
    const afterShow = await waitForCalendarEvent(eventId, true);
    expect(afterShow).not.toBeNull();

    const deleted = await callFunction<DeleteMusicTogetherDemoRequest>({
      functionName: 'deleteMusicTogetherDemo',
      data: { id: demoId },
      idToken: admin.idToken,
    });
    expect(deleted.status).toBe(200);
    const afterDelete = await waitForCalendarEvent(eventId, false);
    expect(afterDelete).toBeNull();
  });
});
