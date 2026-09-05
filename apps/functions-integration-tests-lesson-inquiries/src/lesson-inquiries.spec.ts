/**
 * syncLessonInquiries integration tests (#821)
 *
 * WHY THIS SUITE EXISTS
 * ---------------------
 * This function had no integration coverage at all, and it is the one place
 * where a silent shape change costs real leads. On 2026-09-04 it ingested all
 * 14 lesson inquiries with `contactName: "Unknown"` and no instrument, and
 * every unit test stayed green — because their fixtures were hand-written from
 * the documented Tally shape rather than captured from a real response, so they
 * asserted the assumption that was wrong (#816).
 *
 * The mock server here answers with the **real** shape: question text under
 * `title`, never `label`. That single detail is what turns this from a test
 * that agrees with the code into a test that could have caught the outage.
 *
 * These run against real Firestore + auth emulators and the Tally mock, driving
 * `triggerLessonInquirySync` — the admin-callable twin of the schedule, since
 * `onSchedule` triggers are not reachable over HTTP in the emulator.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  ADMIN_USER,
  EMULATOR_CONFIG,
  callFunction,
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  getFirestoreDoc,
  deleteFirestoreDoc,
  listFirestoreDocs,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';

const TALLY = EMULATOR_CONFIG.tallyMockServerUrl;
const FORM_ID = 'testform';
const OTHER_FORM_ID = 'otherform';

/** Build a question the way the live API does: `title`, and no `label`. */
function question(id: string, type: string, title: string | null) {
  return {
    id,
    type,
    title,
    isTitleModifiedByUser: false,
    formId: FORM_ID,
    isDeleted: false,
    numberOfResponses: 0,
    fields: title
      ? [{ uuid: `${id}-f`, type: 'INPUT_FIELD', questionType: type, title }]
      : [],
  };
}

const QUESTIONS = [
  question('q-name', 'INPUT_TEXT', 'Parent or Student Name'),
  question('q-email', 'INPUT_EMAIL', 'Email'),
  question('q-phone', 'INPUT_PHONE_NUMBER', 'Phone Number'),
  question('q-hidden', 'HIDDEN_FIELDS', null),
  question('q-instrument', 'MULTI_SELECT', 'Which instrument are you interested in?'),
  question('q-who', 'MULTIPLE_CHOICE', 'Who is the student?'),
];

function submission(
  id: string,
  overrides: {
    name?: string;
    email?: string;
    phone?: string;
    instrument?: string;
    who?: string;
    submittedAt?: string;
  } = {}
) {
  const responses: { questionId: string; answer: unknown }[] = [
    { questionId: 'q-name', answer: overrides.name ?? 'Robin Ashfield' },
    { questionId: 'q-email', answer: overrides.email ?? 'robin@example.com' },
    { questionId: 'q-phone', answer: overrides.phone ?? '+15550000001' },
    {
      questionId: 'q-instrument',
      answer: [overrides.instrument ?? 'Old-Time Fiddle'],
    },
  ];
  if (overrides.who) {
    responses.push({ questionId: 'q-who', answer: [overrides.who] });
  }
  return {
    id,
    isCompleted: true,
    submittedAt: overrides.submittedAt ?? '2026-08-26T03:42:50.000Z',
    responses,
  };
}

async function seedForm(
  formId: string,
  submissions: ReturnType<typeof submission>[]
): Promise<void> {
  const res = await fetch(`${TALLY}/_mock/form`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      formId,
      form: { questions: QUESTIONS, submissions },
    }),
  });
  expect(res.status).toBe(200);
}

async function resetMock(): Promise<void> {
  await fetch(`${TALLY}/_mock/reset`, { method: 'POST' });
}

async function setMockFailure(status: number | null): Promise<void> {
  await fetch(`${TALLY}/_mock/failure-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

interface SyncResult {
  seen: number;
  created: number;
  skipped: number;
  repaired: number;
  unmappable: number;
  failedForms: string[];
}

async function runSync(idToken: string): Promise<SyncResult> {
  const response = await callFunction<Record<string, never>, SyncResult>({
    functionName: 'triggerLessonInquirySync',
    data: {},
    idToken,
  });
  expect(response.status).toBe(200);
  return response.data as SyncResult;
}

describe('syncLessonInquiries', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  beforeEach(async () => {
    // Only the inquiries are cleared between tests — wiping Firestore whole
    // would take the `admins` doc with it and every call would 403.
    for (const doc of await listFirestoreDocs('lessonInquiries')) {
      await deleteFirestoreDoc('lessonInquiries', doc.id);
    }
    await resetMock();
    // Both configured forms must exist, or one 404s into `failedForms` and
    // muddies every assertion about the other.
    await seedForm(OTHER_FORM_ID, []);
  });

  it('THE POINT: reads the question text Tally actually sends', async () => {
    // The mock answers with `title`, exactly like the live API. Reading only
    // `label` — which is what shipped — leaves every label-matched field empty
    // and writes "Unknown" while email and phone still look perfect. That is
    // precisely the shape of the production bug, and this assertion is the
    // thing that would have caught it before deploy.
    await seedForm(FORM_ID, [
      submission('sub-1', { who: 'My child (under 18)' }),
    ]);

    const result = await runSync(adminUser.idToken);
    expect(result.created).toBe(1);

    const doc = await getFirestoreDoc('lessonInquiries', 'sub-1');
    expect(doc).toBeTruthy();
    expect(doc?.['contactName']).toBe('Robin Ashfield');
    expect(doc?.['contactName']).not.toBe('Unknown');
    expect(doc?.['interest']).toBe('Old-Time Fiddle');
    expect(doc?.['email']).toBe('robin@example.com');
    expect(doc?.['phone']).toBe('+15550000001');
    // "Who is the student?" decides parent vs student when the lead becomes a
    // student record (#819). Dropping it makes that prefill a coin flip.
    expect(doc?.['studentIs']).toBe('child');
    expect(doc?.['status']).toBe('new');
  });

  it('is idempotent: a second run creates nothing', async () => {
    await seedForm(FORM_ID, [submission('sub-1')]);

    const first = await runSync(adminUser.idToken);
    expect(first.created).toBe(1);

    const second = await runSync(adminUser.idToken);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.repaired).toBe(0);

    const docs = await listFirestoreDocs('lessonInquiries');
    expect(docs).toHaveLength(1);
  });

  it('repairs a stored lead whose answers never mapped, keeping the status', async () => {
    // Exactly the production state on 2026-09-04: contactable, nameless, and
    // already worked by a human. `createIfAbsent` alone could never fix this —
    // the only route left was delete-and-re-ingest, discarding the status
    // along with the bug (#816).
    await setFirestoreDoc('lessonInquiries', 'sub-1', {
      formId: FORM_ID,
      formName: FORM_ID,
      submittedAt: new Date('2026-08-26T03:42:50.000Z'),
      contactName: 'Unknown',
      email: 'robin@example.com',
      availability: [],
      attribution: {},
      status: 'contacted',
      followUpNote: 'Called her Tuesday',
      createdAt: new Date('2026-09-04T19:45:01.000Z'),
      updatedAt: new Date('2026-09-04T19:45:01.000Z'),
    });

    await seedForm(FORM_ID, [submission('sub-1')]);

    const result = await runSync(adminUser.idToken);
    expect(result.repaired).toBe(1);
    expect(result.created).toBe(0);

    const doc = await getFirestoreDoc('lessonInquiries', 'sub-1');
    expect(doc?.['contactName']).toBe('Robin Ashfield');
    expect(doc?.['interest']).toBe('Old-Time Fiddle');
    // The half that matters most: Tally owns the answers, the portal owns the
    // workflow. A repair that resets a worked lead to `new` is worse than the
    // bug it fixes.
    expect(doc?.['status']).toBe('contacted');
    expect(doc?.['followUpNote']).toBe('Called her Tuesday');
  });

  it('never rewrites a row that already matches', async () => {
    // Steady state is zero writes. Without the drift check the schedule would
    // rewrite every lead every 15 minutes and fight the portal for the row.
    await seedForm(FORM_ID, [submission('sub-1')]);
    await runSync(adminUser.idToken);

    const before = await getFirestoreDoc('lessonInquiries', 'sub-1');
    const second = await runSync(adminUser.idToken);
    const after = await getFirestoreDoc('lessonInquiries', 'sub-1');

    expect(second.repaired).toBe(0);
    expect(after?.['updatedAt']).toEqual(before?.['updatedAt']);
  });

  it('skips a submission with no email rather than storing an unanswerable lead', async () => {
    const noEmail = submission('sub-2');
    noEmail.responses = noEmail.responses.filter(
      (r) => r.questionId !== 'q-email'
    );
    await seedForm(FORM_ID, [submission('sub-1'), noEmail]);

    const result = await runSync(adminUser.idToken);

    expect(result.created).toBe(1);
    expect(result.unmappable).toBe(1);
    // One malformed submission must not cost us the other nineteen.
    expect(await getFirestoreDoc('lessonInquiries', 'sub-1')).toBeTruthy();
    expect(await getFirestoreDoc('lessonInquiries', 'sub-2')).toBeFalsy();
  });

  it('one failing form does not cost the other form its leads', async () => {
    // A rotated key or a deleted form must not fail the whole scheduled run.
    await setMockFailure(500);

    const result = await runSync(adminUser.idToken);

    expect(result.failedForms).toContain(FORM_ID);
    expect(result.failedForms).toContain(OTHER_FORM_ID);
    expect(result.created).toBe(0);
  });

  it('sends the bearer token and pins the API version', async () => {
    // An unpinned request can break on Tally's changes with nothing failing
    // loudly — which is the failure mode this whole suite exists for.
    await seedForm(FORM_ID, [submission('sub-1')]);
    await runSync(adminUser.idToken);

    const res = await fetch(`${TALLY}/_mock/requests`);
    const { requests } = (await res.json()) as {
      requests: {
        path: string;
        headers: Record<string, string | undefined>;
      }[];
    };
    const submissionCalls = requests.filter((r) =>
      r.path.includes('/submissions')
    );
    expect(submissionCalls.length).toBeGreaterThan(0);
    expect(submissionCalls[0].headers['authorization']).toMatch(/^Bearer /);
    expect(submissionCalls[0].headers['tally-version']).toBe('2025-02-01');
  });

  it('requires an admin: an unauthenticated call ingests nothing', async () => {
    await seedForm(FORM_ID, [submission('sub-1')]);

    const response = await callFunction({
      functionName: 'triggerLessonInquirySync',
      data: {},
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await listFirestoreDocs('lessonInquiries')).toHaveLength(0);
  });
});
