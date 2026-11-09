/**
 * Integration tests for the website's cancel page: the lookup
 * (`publicSite/lookupRegistrationForCancellation`) and the request
 * (`requestRegistrationCancellation`), against the emulators.
 *
 * The contract a customer and Katie rely on:
 * - before the free cancellation date (two weeks before the class) the page
 *   finds the booking by confirmation number + email, and a request records
 *   itself, emails Katie and the customer once, and shows on the Home Inbox;
 * - after it, the lookup names no deadline and a request is refused;
 * - a wrong email finds nothing;
 * - nothing is ever cancelled or refunded by the request.
 */
import {
  ADMIN_USER,
  PUBLISHED_CLASS,
  callFunction,
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  getFirestoreDoc,
  listFirestoreDocs,
  setFirestoreDoc,
  type TestUser,
} from '@maple/firebase/integration-test-utils';
import type {
  LookupRegistrationForCancellationRequest,
  LookupRegistrationForCancellationResponse,
  RequestRegistrationCancellationRequest,
  RequestRegistrationCancellationResponse,
} from '@maple/ts/firebase/api-types';

const FAR_CLASS = 'cancel-far-class';
const SOON_CLASS = 'cancel-soon-class';

/** A class `days` from now (a real duration is fine here). */
function classInDays(days: number) {
  const at = new Date(Date.now() + days * 86_400_000).toISOString();
  return { ...PUBLISHED_CLASS, sessions: [{ dateTime: at }], firstSessionAt: at };
}

function seedReg(id: string, classId: string, overrides: Record<string, unknown> = {}) {
  return setFirestoreDoc('registrations', id, {
    classId,
    customerEmail: 'robin@example.com',
    customerName: 'Robin Ashfield',
    quantity: 1,
    pricePaidCents: 4770,
    subtotalCents: 4500,
    taxAmountCents: 270,
    taxRatePercent: 6,
    confirmationNumber: `MS-${id.slice(-6).toUpperCase()}`,
    status: 'confirmed',
    source: 'web',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });
}

const lookup = (data: LookupRegistrationForCancellationRequest) =>
  callFunction<LookupRegistrationForCancellationRequest, LookupRegistrationForCancellationResponse>({
    functionName: 'publicSite/lookupRegistrationForCancellation',
    data,
  });

const request = (data: RequestRegistrationCancellationRequest) =>
  callFunction<RequestRegistrationCancellationRequest, RequestRegistrationCancellationResponse>({
    functionName: 'requestRegistrationCancellation',
    data,
  });

/**
 * The refusal's message. (The request pipeline answers every error except
 * permission-denied as 400 INVALID_ARGUMENT, so the code says little.)
 */
function errorMessage(raw: unknown): string | undefined {
  return (raw as { error?: { message?: string } })?.error?.message;
}

async function mailTo(address: string) {
  const docs = await listFirestoreDocs('mail');
  return docs
    .map((d) => d.data as { to?: string; template?: { name?: string } })
    .filter((m) => m.to === address);
}

describe('cancel page', () => {
  let adminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
  });

  beforeEach(async () => {
    await clearFirestoreEmulator();
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
    await setFirestoreDoc('classes', FAR_CLASS, classInDays(30));
    await setFirestoreDoc('classes', SOON_CLASS, classInDays(5));
  });

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it('before the date: finds it, records one request, emails once, and lists it on the Inbox', async () => {
    await seedReg('reg-far001', FAR_CLASS);

    const found = await lookup({ confirmationNumber: 'ms-far001', email: 'ROBIN@example.com' });
    expect(found.status).toBe(200);
    expect(found.data).toMatchObject({
      found: true,
      className: PUBLISHED_CLASS.name,
      cancellationRequested: false,
    });
    const deadline = (found.data as { freeCancellationUntil?: string }).freeCancellationUntil;
    expect(deadline).toBeDefined();
    expect(new Date(deadline!).getTime()).toBeGreaterThan(Date.now());

    const asked = await request({ confirmationNumber: 'MS-FAR001', email: 'robin@example.com' });
    expect(asked.status).toBe(200);
    expect(asked.data).toEqual({ ok: true, freeCancellationUntil: deadline });

    // Recorded, and nothing cancelled or refunded.
    const stored = await getFirestoreDoc('registrations', 'reg-far001');
    expect(stored?.['cancellationRequestedAt']).toBeDefined();
    expect(stored?.['status']).toBe('confirmed');

    // A second click: same answer, no second email.
    expect((await request({ confirmationNumber: 'MS-FAR001', email: 'robin@example.com' })).status).toBe(200);
    const customerMail = await mailTo('robin@example.com');
    expect(customerMail.map((m) => m.template?.name)).toEqual([
      'registration-cancellation-requested',
    ]);
    const allMail = await listFirestoreDocs('mail');
    expect(
      allMail.filter(
        (d) => (d.data as { template?: { name?: string } }).template?.name ===
          'registration-cancellation-request-staff'
      )
    ).toHaveLength(1);

    // The lookup now says so.
    const again = await lookup({ confirmationNumber: 'MS-FAR001', email: 'robin@example.com' });
    expect(again.data).toMatchObject({ found: true, cancellationRequested: true });

    // Katie's Home Inbox.
    const inbox = await callFunction<Record<string, never>, { items: Array<{ kind: string; href: string; actionLabel: string }> }>({
      functionName: 'lessons/getInbox',
      data: {},
      idToken: adminUser.idToken,
    });
    expect(inbox.status).toBe(200);
    expect(inbox.data?.items.find((i) => i.kind === 'cancellation-request')).toMatchObject({
      href: `/classes/${FAR_CLASS}/roster`,
      actionLabel: 'Cancel & refund',
    });
  });

  it('after the date: no deadline in the lookup, and a request is refused', async () => {
    await seedReg('reg-soon01', SOON_CLASS);

    const found = await lookup({ confirmationNumber: 'MS-SOON01', email: 'robin@example.com' });
    expect(found.status).toBe(200);
    expect(found.data).toMatchObject({ found: true, className: PUBLISHED_CLASS.name });
    expect((found.data as { freeCancellationUntil?: string }).freeCancellationUntil).toBeUndefined();

    const asked = await request({ confirmationNumber: 'MS-SOON01', email: 'robin@example.com' });
    expect(asked.status).toBe(400);
    expect(errorMessage(asked.raw)).toMatch(/could not find a registration that can be cancelled online/);
    const stored = await getFirestoreDoc('registrations', 'reg-soon01');
    expect(stored?.['cancellationRequestedAt']).toBeUndefined();
    expect(await mailTo('robin@example.com')).toHaveLength(0);
  });

  it('a wrong email finds nothing and cannot request', async () => {
    await seedReg('reg-far002', FAR_CLASS);

    const found = await lookup({ confirmationNumber: 'MS-FAR002', email: 'someone@example.com' });
    expect(found.data).toEqual({ found: false });

    const asked = await request({ confirmationNumber: 'MS-FAR002', email: 'someone@example.com' });
    expect(asked.status).toBe(400);
    expect(errorMessage(asked.raw)).toMatch(/could not find a registration that can be cancelled online/);
  });

  it('a cancelled registration is not found', async () => {
    await seedReg('reg-far003', FAR_CLASS, { status: 'cancelled' });
    const found = await lookup({ confirmationNumber: 'MS-FAR003', email: 'robin@example.com' });
    expect(found.data).toEqual({ found: false });
  });
});
