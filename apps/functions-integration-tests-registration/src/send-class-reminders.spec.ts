/**
 * Integration tests for the day-of class reminder system.
 *
 * Drives the admin-callable `triggerClassReminders` (which runs the same
 * business logic as the scheduled `sendClassReminders`) against the
 * Firebase emulator. The scheduled trigger itself isn't reachable via HTTP
 * in the emulator — the admin trigger is the test seam.
 *
 * Coverage matrix (matches the task spec):
 *   1. Class today + paid registration + no reminder yet
 *      → mail doc queued + per-session stamp set on registration.
 *   2. Run twice on same day → only one mail doc per registration.
 *   3. Cancelled / refunded registration → skipped.
 *   4. Class tomorrow → skipped.
 *   5. Class yesterday → skipped.
 *   6. Multiple paid registrations on the same class today → one mail doc each.
 *   7. Multi-session class with a session today (and other sessions on
 *      other days) → reminder fires for today's session only.
 */
import {
  callFunction,
  clearAuthEmulator,
  clearFirestoreEmulator,
  createTestUser,
  getFirestoreDoc,
  listFirestoreDocs,
  setFirestoreDoc,
} from '@maple/firebase/integration-test-utils';
import type { TestUser } from '@maple/firebase/integration-test-utils';
import {
  ADMIN_USER,
  NON_ADMIN_USER,
} from '@maple/firebase/integration-test-utils';

interface SendClassRemindersResult {
  mailQueued: number;
  skippedAlreadySent: number;
  skippedNotPaid: number;
  classesWithSessionToday: number;
}

// ---------------------------------------------------------------------------
// Helpers — build a class scheduled at a specific time today / yesterday /
// tomorrow in ET. The `sendClassReminders` function computes its today
// window in ET, so anchor the times in ET as well.
// ---------------------------------------------------------------------------

const TIMEZONE = 'America/New_York';

/**
 * Returns a Date for "today at 14:00 ET" (or whatever hour the caller
 * passes). Implementation mirrors the logic inside the function under
 * test, but is independent enough that a bug in either side wouldn't be
 * masked by a matching bug here.
 */
function timeAtOffsetDays(offsetDays: number, hourEt = 14, minuteEt = 0): Date {
  const now = new Date();
  // YYYY-MM-DD for "now + offsetDays" in ET.
  const target = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
  const [yStr, mStr, dStr] = ymd.split('-');
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  const offsetMinutes = getEtOffsetMinutes(target);
  const utcMs =
    Date.UTC(y, m, d, hourEt, minuteEt, 0, 0) - offsetMinutes * 60_000;
  return new Date(utcMs);
}

function getEtOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value;
  const hour = map['hour'] === '24' ? '00' : map['hour'];
  const tzMs = Date.UTC(
    Number(map['year']),
    Number(map['month']) - 1,
    Number(map['day']),
    Number(hour),
    Number(map['minute']),
    Number(map['second'])
  );
  return Math.round((tzMs - at.getTime()) / 60_000);
}

function buildClass(overrides: {
  name: string;
  sessions: Date[];
  status?: string;
  instructorId?: string;
  location?: string;
}): Record<string, unknown> {
  const sessions = overrides.sessions
    .slice()
    .sort((a, b) => a.getTime() - b.getTime());
  return {
    name: overrides.name,
    description: 'Test class for reminder integration tests.',
    sessions: sessions.map((s) => ({ dateTime: s.toISOString() })),
    firstSessionAt: sessions[0].toISOString(),
    durationMinutes: 90,
    capacity: 12,
    priceCents: 4500,
    skillLevel: 'beginner',
    status: overrides.status ?? 'published',
    instructorId: overrides.instructorId,
    location: overrides.location,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildRegistration(overrides: {
  classId: string;
  email: string;
  name: string;
  status?: string;
  reminderSentForSessions?: Record<string, string>;
}): Record<string, unknown> {
  return {
    classId: overrides.classId,
    customerEmail: overrides.email,
    customerName: overrides.name,
    quantity: 1,
    pricePaidCents: 4770,
    subtotalCents: 4500,
    taxAmountCents: 270,
    taxRatePercent: 6.0,
    status: overrides.status ?? 'confirmed',
    confirmationNumber: 'MS-TEST',
    reminderSentForSessions: overrides.reminderSentForSessions ?? {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function clearMailCollection(): Promise<void> {
  // The `mail` collection isn't covered by the `clearFirestoreEmulator`
  // call's project default — but clearFirestoreEmulator wipes the entire
  // (default) database, so this is just defense against future divergence.
  const docs = await listFirestoreDocs('mail');
  // No-op if already empty; the per-suite clearFirestoreEmulator call
  // handles wiping. Kept for explicitness inside individual tests.
  if (docs.length > 0) {
    // No bulk delete helper — recreate the firestore from scratch.
    await clearFirestoreEmulator();
  }
}

async function callTriggerAsAdmin(
  adminToken: string
): Promise<{ status: number; data?: SendClassRemindersResult }> {
  const result = await callFunction<
    Record<string, never>,
    SendClassRemindersResult
  >({
    functionName: 'triggerClassReminders',
    data: {},
    idToken: adminToken,
  });
  return { status: result.status, data: result.data };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('sendClassReminders (via triggerClassReminders)', () => {
  let adminUser: TestUser;
  let nonAdminUser: TestUser;

  beforeAll(async () => {
    await clearAuthEmulator();
    await clearFirestoreEmulator();

    adminUser = await createTestUser(ADMIN_USER.email, ADMIN_USER.password);
    nonAdminUser = await createTestUser(
      NON_ADMIN_USER.email,
      NON_ADMIN_USER.password
    );

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
    // Wipe Firestore but preserve the admin record so the token stays valid.
    await clearFirestoreEmulator();
    await setFirestoreDoc('admins', adminUser.uid, {
      userId: adminUser.uid,
      email: adminUser.email,
    });
  });

  describe('Auth guard', () => {
    it('rejects unauthenticated callers', async () => {
      const result = await callFunction({
        functionName: 'triggerClassReminders',
        data: {},
      });
      expect(result.status).not.toBe(200);
    });

    it('rejects non-admin users', async () => {
      const result = await callFunction({
        functionName: 'triggerClassReminders',
        data: {},
        idToken: nonAdminUser.idToken,
      });
      expect(result.status).not.toBe(200);
    });
  });

  describe('Happy path', () => {
    it('queues a reminder and stamps the registration when class is today and registrant is paid', async () => {
      const classId = 'class-today-1';
      const sessionDate = timeAtOffsetDays(0, 14); // 2:00 PM ET today
      const sessionIso = sessionDate.toISOString();

      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Today Pottery',
          sessions: [sessionDate],
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-1',
        buildRegistration({
          classId,
          email: 'alice@example.com',
          name: 'Alice',
        })
      );

      await clearMailCollection();
      const result = await callTriggerAsAdmin(adminUser.idToken);

      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(1);
      expect(result.data?.classesWithSessionToday).toBe(1);
      expect(result.data?.skippedAlreadySent).toBe(0);

      const mailDocs = await listFirestoreDocs('mail');
      expect(mailDocs).toHaveLength(1);
      const mail = mailDocs[0].data as {
        to: string;
        template: { name: string; data: Record<string, unknown> };
      };
      expect(mail.to).toBe('alice@example.com');
      expect(mail.template.name).toBe('class-reminder');
      expect(mail.template.data['customerName']).toBe('Alice');
      expect(mail.template.data['className']).toBe('Today Pottery');
      expect(typeof mail.template.data['classDate']).toBe('string');
      expect(typeof mail.template.data['classStartTime']).toBe('string');
      expect(typeof mail.template.data['googleReviewUrl']).toBe('string');
      // Default location applies when class.location is unset.
      expect(mail.template.data['classLocation']).toBe(
        '688 Beulah Rd, Morgantown, WV 26508'
      );

      const reg = await getFirestoreDoc('registrations', 'reg-1');
      const stamps = reg?.['reminderSentForSessions'] as
        | Record<string, unknown>
        | undefined;
      expect(stamps).toBeDefined();
      expect(stamps && stamps[sessionIso]).toBeTruthy();
      expect(reg?.['reminderSentAt']).toBeTruthy();
    });

    it('uses the class location when one is set', async () => {
      const classId = 'class-today-loc';
      const sessionDate = timeAtOffsetDays(0, 11);
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Studio Class',
          sessions: [sessionDate],
          location: 'The Annex, 200 High St',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-loc',
        buildRegistration({
          classId,
          email: 'bob@example.com',
          name: 'Bob',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(1);

      const mailDocs = await listFirestoreDocs('mail');
      const mail = mailDocs[0].data as {
        template: { data: Record<string, unknown> };
      };
      expect(mail.template.data['classLocation']).toBe(
        'The Annex, 200 High St'
      );
    });

    it('includes instructor name when set', async () => {
      const classId = 'class-today-instr';
      const instructorId = 'instr-1';
      const sessionDate = timeAtOffsetDays(0, 18);

      await setFirestoreDoc('instructors', instructorId, {
        name: 'Jane Weaver',
        email: 'jane@example.com',
        status: 'active',
        bio: 'Weaver',
        specialties: ['weaving'],
        payRateType: 'flat',
        payRate: 5000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Weaving Basics',
          sessions: [sessionDate],
          instructorId,
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-instr',
        buildRegistration({
          classId,
          email: 'cara@example.com',
          name: 'Cara',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);

      const mailDocs = await listFirestoreDocs('mail');
      const mail = mailDocs[0].data as {
        template: { data: Record<string, unknown> };
      };
      expect(mail.template.data['instructorName']).toBe('Jane Weaver');
    });
  });

  describe('Idempotency', () => {
    it('a second run on the same day does not re-send', async () => {
      const classId = 'class-twice';
      const sessionDate = timeAtOffsetDays(0, 10);

      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Repeat Run Pottery',
          sessions: [sessionDate],
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-twice',
        buildRegistration({
          classId,
          email: 'dee@example.com',
          name: 'Dee',
        })
      );

      const first = await callTriggerAsAdmin(adminUser.idToken);
      expect(first.data?.mailQueued).toBe(1);

      const second = await callTriggerAsAdmin(adminUser.idToken);
      expect(second.data?.mailQueued).toBe(0);
      expect(second.data?.skippedAlreadySent).toBe(1);

      const mailDocs = await listFirestoreDocs('mail');
      expect(mailDocs).toHaveLength(1);
    });
  });

  describe('Status filter', () => {
    it('skips cancelled and refunded registrations', async () => {
      const classId = 'class-status';
      const sessionDate = timeAtOffsetDays(0, 12);
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Status Test',
          sessions: [sessionDate],
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-cancelled',
        buildRegistration({
          classId,
          email: 'cancel@example.com',
          name: 'Cancelled',
          status: 'cancelled',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-refunded',
        buildRegistration({
          classId,
          email: 'refund@example.com',
          name: 'Refunded',
          status: 'refunded',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-pending',
        buildRegistration({
          classId,
          email: 'pending@example.com',
          name: 'Pending',
          status: 'pending',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-confirmed',
        buildRegistration({
          classId,
          email: 'confirmed@example.com',
          name: 'Confirmed',
          status: 'confirmed',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      // Only the confirmed registrant gets a reminder.
      expect(result.data?.mailQueued).toBe(1);
      expect(result.data?.skippedNotPaid).toBe(3);

      const mailDocs = await listFirestoreDocs('mail');
      expect(mailDocs).toHaveLength(1);
      const mail = mailDocs[0].data as { to: string };
      expect(mail.to).toBe('confirmed@example.com');
    });
  });

  describe('Date filter', () => {
    it('skips classes scheduled tomorrow', async () => {
      const classId = 'class-tomorrow';
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Tomorrow Class',
          sessions: [timeAtOffsetDays(1, 14)],
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-tomorrow',
        buildRegistration({
          classId,
          email: 'tom@example.com',
          name: 'Tom',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(0);
      expect(result.data?.classesWithSessionToday).toBe(0);
      expect(await listFirestoreDocs('mail')).toHaveLength(0);
    });

    it('skips classes scheduled yesterday', async () => {
      const classId = 'class-yesterday';
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Yesterday Class',
          sessions: [timeAtOffsetDays(-1, 14)],
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-yesterday',
        buildRegistration({
          classId,
          email: 'yest@example.com',
          name: 'Yesterday',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(0);
      expect(result.data?.classesWithSessionToday).toBe(0);
      expect(await listFirestoreDocs('mail')).toHaveLength(0);
    });
  });

  describe('Multiple registrations', () => {
    it('queues one mail doc per paid registration on a class today', async () => {
      const classId = 'class-multi-reg';
      const sessionDate = timeAtOffsetDays(0, 13);
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Big Class',
          sessions: [sessionDate],
        })
      );
      await setFirestoreDoc(
        'registrations',
        'multi-1',
        buildRegistration({
          classId,
          email: 'one@example.com',
          name: 'One',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'multi-2',
        buildRegistration({
          classId,
          email: 'two@example.com',
          name: 'Two',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'multi-3',
        buildRegistration({
          classId,
          email: 'three@example.com',
          name: 'Three',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(3);

      const mailDocs = await listFirestoreDocs('mail');
      expect(mailDocs).toHaveLength(3);
      const recipients = mailDocs.map((d) => (d.data as { to: string }).to);
      expect(recipients.sort()).toEqual([
        'one@example.com',
        'three@example.com',
        'two@example.com',
      ]);
    });
  });

  describe('Multi-session class', () => {
    it('reminds for today\'s session only and stamps that session key', async () => {
      const classId = 'class-multi-session';
      const sessionToday = timeAtOffsetDays(0, 18);
      const sessionTomorrow = timeAtOffsetDays(1, 18);
      const sessionNextWeek = timeAtOffsetDays(7, 18);

      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Series Class',
          sessions: [sessionTomorrow, sessionToday, sessionNextWeek],
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-multi-session',
        buildRegistration({
          classId,
          email: 'series@example.com',
          name: 'Series',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(1);
      expect(result.data?.classesWithSessionToday).toBe(1);

      const mailDocs = await listFirestoreDocs('mail');
      expect(mailDocs).toHaveLength(1);

      // Only today's ISO key should be stamped — tomorrow and next week
      // remain absent so future runs can fire reminders for them.
      const reg = await getFirestoreDoc('registrations', 'reg-multi-session');
      const stamps = (reg?.['reminderSentForSessions'] ?? {}) as Record<
        string,
        unknown
      >;
      const stampKeys = Object.keys(stamps);
      expect(stampKeys).toHaveLength(1);
      expect(stampKeys[0]).toBe(sessionToday.toISOString());
      expect(stamps[sessionTomorrow.toISOString()]).toBeUndefined();
      expect(stamps[sessionNextWeek.toISOString()]).toBeUndefined();

      // Re-running stays a no-op for the same session.
      const second = await callTriggerAsAdmin(adminUser.idToken);
      expect(second.data?.mailQueued).toBe(0);
      expect(second.data?.skippedAlreadySent).toBe(1);
    });
  });

  describe('Class status filter', () => {
    it('skips draft classes even if a session is today', async () => {
      const classId = 'class-draft-today';
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Draft Class',
          sessions: [timeAtOffsetDays(0, 15)],
          status: 'draft',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-draft',
        buildRegistration({
          classId,
          email: 'draft@example.com',
          name: 'Draft',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(0);
      expect(await listFirestoreDocs('mail')).toHaveLength(0);
    });

    it('skips cancelled classes even if a session is today', async () => {
      const classId = 'class-cancelled-today';
      await setFirestoreDoc(
        'classes',
        classId,
        buildClass({
          name: 'Cancelled Class',
          sessions: [timeAtOffsetDays(0, 15)],
          status: 'cancelled',
        })
      );
      await setFirestoreDoc(
        'registrations',
        'reg-canc-class',
        buildRegistration({
          classId,
          email: 'cc@example.com',
          name: 'CC',
        })
      );

      const result = await callTriggerAsAdmin(adminUser.idToken);
      expect(result.status).toBe(200);
      expect(result.data?.mailQueued).toBe(0);
      expect(await listFirestoreDocs('mail')).toHaveLength(0);
    });
  });
});
