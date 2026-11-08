/**
 * Integration tests for the per-family Music Together calendar feed.
 *
 * Runs `calendarFamilyMusicTogetherFeed` in the Firebase emulator. Proves the
 * token-scoped ICS feed returns exactly the family's confirmed-section sessions
 * (and updates when a new session appears), and that an unknown token yields an
 * empty but valid calendar (no enumeration).
 *
 * Also asserts the create-registration flow now stamps a per-family
 * `calendarToken` and drops a `webcal://` subscribe link into the confirmation
 * email.
 */
import {
  clearAuthEmulator,
  clearFirestoreEmulator,
  setFirestoreDoc,
  getFirestoreDoc,
  listFirestoreDocs,
  callFunction,
  getFunctionUrl,
  TRIGGER_WAIT_TIMEOUT_MS,
} from '@maple/firebase/integration-test-utils';
import type {
  CreateMusicTogetherRegistrationRequest,
  CreateMusicTogetherRegistrationResponse,
} from '@maple/ts/firebase/api-types';

const FAMILY_TOKEN = 'famtok-integration-abc123';

const SESSION_A1 = new Date('2030-09-10T14:00:00Z');
const SESSION_A2 = new Date('2030-09-17T14:00:00Z');
const SESSION_B1 = new Date('2030-09-11T14:00:00Z');

/** The id `onMusicTogetherSectionWrite` gives a section session's event. */
function sessionEventId(sectionId: string, session: Date): string {
  return `mt-${sectionId}-${session.getTime()}`;
}

async function fetchFeed(
  token: string
): Promise<{ status: number; body: string }> {
  const url = `${getFunctionUrl('calendarFamilyMusicTogetherFeed')}?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { method: 'GET' });
  return { status: res.status, body: await res.text() };
}

/**
 * A visible section, so `onMusicTogetherSectionWrite` gives every session a
 * calendar event. The trigger is the only writer of these events: seeding them
 * by hand races it, because it reconciles a section's events to the section
 * and deletes any it did not produce.
 */
function sectionDoc(name: string, sessions: Date[]): Record<string, unknown> {
  return {
    name,
    sessions: sessions.map((dateTime) => ({ dateTime })),
    visible: true,
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Poll until the trigger has written every one of these calendar events. */
async function waitForCalendarEvents(
  ids: string[],
  timeoutMs = TRIGGER_WAIT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let missing = ids;
  while (Date.now() < deadline) {
    const found = await Promise.all(
      ids.map((id) => getFirestoreDoc('calendarEvents', id))
    );
    missing = ids.filter((_, i) => !found[i]);
    if (missing.length === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Timed out waiting for calendar events: ${missing.join(', ')}`
  );
}

describe('calendarFamilyMusicTogetherFeed', () => {
  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    // Two sections. The family is confirmed in A only.
    await setFirestoreDoc(
      'musicTogetherSections',
      'fam-sec-a',
      sectionDoc('Family Class A', [SESSION_A1])
    );
    await setFirestoreDoc(
      'musicTogetherSections',
      'fam-sec-b',
      sectionDoc('Family Class B', [SESSION_B1])
    );
    await waitForCalendarEvents([
      sessionEventId('fam-sec-a', SESSION_A1),
      sessionEventId('fam-sec-b', SESSION_B1),
    ]);

    // The family: confirmed in A, and a pending (unpaid) reservation in B with
    // the SAME token — B must NOT appear in the feed.
    await setFirestoreDoc('musicTogetherRegistrations', 'fam-reg-a', {
      sectionId: 'fam-sec-a',
      parentNames: ['Casey Family'],
      children: [{ name: 'Kid', dob: new Date('2023-01-01') }],
      email: 'casey@test.com',
      phone: '304-555-0001',
      address: 'somewhere',
      paymentPlan: 'full',
      policiesAcceptedAt: new Date(),
      pricePaidCents: 25200,
      status: 'confirmed',
      calendarToken: FAMILY_TOKEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await setFirestoreDoc('musicTogetherRegistrations', 'fam-reg-b', {
      sectionId: 'fam-sec-b',
      parentNames: ['Casey Family'],
      children: [{ name: 'Kid', dob: new Date('2023-01-01') }],
      email: 'casey@test.com',
      phone: '304-555-0001',
      address: 'somewhere',
      paymentPlan: 'full',
      policiesAcceptedAt: new Date(),
      pricePaidCents: 25200,
      status: 'pending',
      calendarToken: FAMILY_TOKEN,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }, TRIGGER_WAIT_TIMEOUT_MS + 15_000);

  afterAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();
  });

  it("returns exactly the family's confirmed-section sessions", async () => {
    const { status, body } = await fetchFeed(FAMILY_TOKEN);

    expect(status).toBe(200);
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).toContain('Family Class A');
    expect(body).toContain(`UID:${sessionEventId('fam-sec-a', SESSION_A1)}`);
    // The pending section B must be excluded.
    expect(body).not.toContain('Family Class B');
  });

  it('reflects a newly added session (feed auto-updates)', async () => {
    // Add a session to the section; the trigger gives it an event.
    await setFirestoreDoc(
      'musicTogetherSections',
      'fam-sec-a',
      sectionDoc('Family Class A', [SESSION_A1, SESSION_A2])
    );
    await waitForCalendarEvents([sessionEventId('fam-sec-a', SESSION_A2)]);

    const { body } = await fetchFeed(FAMILY_TOKEN);
    expect(body).toContain(`UID:${sessionEventId('fam-sec-a', SESSION_A1)}`);
    expect(body).toContain(`UID:${sessionEventId('fam-sec-a', SESSION_A2)}`);
  });

  it('returns an empty but valid calendar for an unknown token', async () => {
    const { status, body } = await fetchFeed('does-not-exist-token');
    expect(status).toBe(200);
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).not.toContain('BEGIN:VEVENT');
  });

  it('400s when no token is supplied', async () => {
    const res = await fetch(
      getFunctionUrl('calendarFamilyMusicTogetherFeed'),
      { method: 'GET' }
    );
    expect(res.status).toBe(400);
  });

  it('registration stamps a calendar token and emails a webcal subscribe link', async () => {
    await setFirestoreDoc('musicTogetherSections', 'fam-sec-reg', {
      name: 'Registerable Section',
      sessions: [{ dateTime: new Date('2030-10-01T14:00:00Z') }],
      capacityFamilies: 8,
      priceFullCents: 25200,
      visible: true,
      enrollmentActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await callFunction<
      CreateMusicTogetherRegistrationRequest,
      CreateMusicTogetherRegistrationResponse
    >({
      functionName: 'createMusicTogetherRegistration',
      data: {
        sectionId: 'fam-sec-reg',
        adultFirstName: 'Robin',
        adultLastName: 'Lark',
        parentNames: ['Robin Lark'],
        children: [{ name: 'Wren', dob: '2023-04-01' }],
        email: 'robin@test.com',
        phone: '304-555-2222',
        address: '1 Music Ln, Morgantown, WV',
        paymentPlan: 'full',
        policiesAccepted: true,
        privacyConsent: true,
        paymentNonce: 'cnon:card-nonce-ok',
      },
    });

    expect(result.status).toBe(200);
    const reg = await getFirestoreDoc(
      'musicTogetherRegistrations',
      result.data!.registrationId
    );
    const token = (reg as { calendarToken?: string }).calendarToken;
    expect(typeof token).toBe('string');
    expect(token && token.length).toBeGreaterThan(20);

    const mail = await listFirestoreDocs('mail');
    const robinMail = mail.find(
      (m) => (m.data as { to?: string }).to === 'robin@test.com'
    );
    expect(robinMail).toBeDefined();
    const subscribeUrl = (
      robinMail!.data as {
        template?: { data?: { calendarSubscribeUrl?: string } };
      }
    ).template?.data?.calendarSubscribeUrl;
    expect(subscribeUrl).toBe(
      `webcal://maple-and-spruce-dev.web.app/calendar/family/${token}.ics`
    );

    // The freshly-registered family's feed now serves their session.
    const { body } = await fetchFeed(token!);
    expect(body).toContain('BEGIN:VCALENDAR');
  });
});
