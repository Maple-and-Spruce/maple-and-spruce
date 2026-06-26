/**
 * Integration tests for the Craft Club self-service flow.
 *
 * Exercises the full magic-link arc against real Firestore (emulator) with
 * Square calls intercepted by the mock server:
 *   requestCraftClubManageLink → (read emailed token) → startCraftClubSession →
 *   getCraftClubSubscription → updateCraftClubPaymentMethod → cancel.
 *
 * The maple-core functions (request-link/start-session/get) and the maple-square
 * functions (cancel/update) all run in the same emulator session, so this one
 * suite covers both codebases end to end.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  listFirestoreDocs,
  callFunction,
} from '@maple/firebase/integration-test-utils';

const EMAIL = 'selfservice@test.com';

interface SessionResult {
  sessionToken: string;
  member: { status: string };
}

function tokenFromMail(
  docs: Array<{ data: Record<string, unknown> }>
): string {
  const mine = docs.find((d) => d.data['to'] === EMAIL);
  if (!mine) throw new Error('no manage-link email was queued');
  const template = mine.data['template'] as {
    name: string;
    data: { manageUrl: string };
  };
  expect(template.name).toBe('craft-club-manage-link');
  const token = new URL(template.data.manageUrl).searchParams.get('token');
  if (!token) throw new Error('manage URL had no token');
  return token;
}

describe('Craft Club self-service', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
    await setFirestoreDoc('craftClubMembers', 'ss-1', {
      email: EMAIL,
      name: 'Self Service',
      status: 'active',
      squareCustomerId: 'cust-ss',
      squareCardId: 'card-ss',
      squareSubscriptionId: 'sub-ss',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('runs the full magic-link → manage → cancel flow', async () => {
    // 1. Request a manage link — always ok.
    const reqResult = await callFunction({
      functionName: 'requestCraftClubManageLink',
      data: { email: EMAIL },
    });
    expect(reqResult.status).toBe(200);

    // 2. Pull the single-use token out of the queued email.
    const token = tokenFromMail(await listFirestoreDocs('mail'));

    // 3. Exchange it for a session.
    const start = await callFunction<{ token: string }, SessionResult>({
      functionName: 'startCraftClubSession',
      data: { token },
    });
    expect(start.status).toBe(200);
    expect(start.data?.member.status).toBe('active');
    const sessionToken = start.data!.sessionToken;

    // 3b. The magic token is single-use — a second exchange must fail.
    const replay = await callFunction({
      functionName: 'startCraftClubSession',
      data: { token },
    });
    expect(replay.status).not.toBe(200);

    // 4. Read the subscription with the session.
    const get = await callFunction<{ sessionToken: string }, SessionResult>({
      functionName: 'getCraftClubSubscription',
      data: { sessionToken },
    });
    expect(get.status).toBe(200);
    expect(get.data?.member.status).toBe('active');

    // 5. Change the payment method (Square card-on-file + subscription update).
    const update = await callFunction({
      functionName: 'updateCraftClubPaymentMethod',
      data: { sessionToken, paymentNonce: 'cnon:new-card' },
    });
    expect(update.status).toBe(200);

    // 6. Cancel.
    const cancel = await callFunction<{ sessionToken: string }, SessionResult>({
      functionName: 'cancelCraftClubSubscription',
      data: { sessionToken },
    });
    expect(cancel.status).toBe(200);
    expect(cancel.data?.member.status).toBe('cancelled');
  });

  it('returns ok (no leak) for an unknown email and queues no email', async () => {
    const result = await callFunction({
      functionName: 'requestCraftClubManageLink',
      data: { email: 'nobody-unknown@test.com' },
    });
    expect(result.status).toBe(200);
    const mail = await listFirestoreDocs('mail');
    expect(
      mail.some((d) => d.data['to'] === 'nobody-unknown@test.com')
    ).toBe(false);
  });

  it('rejects a bogus session token', async () => {
    const result = await callFunction({
      functionName: 'getCraftClubSubscription',
      data: { sessionToken: 'not-a-real-session' },
    });
    expect(result.status).not.toBe(200);
  });
});
