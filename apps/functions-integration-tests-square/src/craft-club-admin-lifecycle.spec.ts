/**
 * Integration tests for the Craft Club admin lifecycle functions.
 *
 * Admin-only pause → resume → cancel against the emulator, with Square calls
 * intercepted by the mock server. Verifies the member status transitions and
 * that cancellation queues a confirmation email.
 */
import {
  createTestUser,
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  listFirestoreDocs,
  callFunction,
  ADMIN_USER,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';

const MEMBER_EMAIL = 'admin-lifecycle@test.com';

interface MemberResult {
  member: { status: string };
}

describe('Craft Club admin lifecycle', () => {
  let admin: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    admin = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    await setFirestoreDoc('admins', admin.uid, {
      userId: admin.uid,
      email: admin.email,
    });
    await setFirestoreDoc('craftClubMembers', 'al-1', {
      email: MEMBER_EMAIL,
      name: 'Lifecycle Member',
      status: 'active',
      squareCustomerId: 'cust-al',
      squareCardId: 'card-al',
      squareSubscriptionId: 'sub-al',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('pauses, resumes, then cancels (and emails) a membership', async () => {
    const pause = await callFunction<{ id: string }, MemberResult>({
      functionName: 'adminPauseCraftClubSubscription',
      data: { id: 'al-1' },
      idToken: admin.idToken,
    });
    expect(pause.status).toBe(200);
    expect(pause.data?.member.status).toBe('paused');

    const resume = await callFunction<{ id: string }, MemberResult>({
      functionName: 'adminResumeCraftClubSubscription',
      data: { id: 'al-1' },
      idToken: admin.idToken,
    });
    expect(resume.status).toBe(200);
    expect(resume.data?.member.status).toBe('active');

    const cancel = await callFunction<{ id: string }, MemberResult>({
      functionName: 'adminCancelCraftClubSubscription',
      data: { id: 'al-1' },
      idToken: admin.idToken,
    });
    expect(cancel.status).toBe(200);
    expect(cancel.data?.member.status).toBe('cancelled');

    const mail = await listFirestoreDocs('mail');
    const cancelEmail = mail.find(
      (d) =>
        d.data['to'] === MEMBER_EMAIL &&
        (d.data['template'] as { name?: string })?.name ===
          'craft-club-cancelled'
    );
    expect(cancelEmail).toBeDefined();
  });

  it('rejects an unauthenticated caller', async () => {
    const result = await callFunction({
      functionName: 'adminPauseCraftClubSubscription',
      data: { id: 'al-1' },
    });
    expect(result.status).not.toBe(200);
  });
});
