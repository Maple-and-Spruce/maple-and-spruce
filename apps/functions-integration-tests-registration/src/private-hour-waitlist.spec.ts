/**
 * Integration test for the per-hour waitlist on a private-hours class.
 *
 * End to end against the emulator: `addToClassWaitlist` stores who is waiting
 * on which hour, and when the registration holding an hour is cancelled,
 * `notifyWaitlistOnSpotOpen` emails the people waiting on that hour or on any
 * hour, takes only them off the list, and leaves someone waiting on a
 * different hour alone.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  callFunction,
  clearFirestoreEmulator,
  FirestoreTimestamp,
  listFirestoreDocs,
  setFirestoreDoc,
  TRIGGER_WAIT_TIMEOUT_MS,
} from '@maple/firebase/integration-test-utils';
import { formatPrivateHour } from '@maple/ts/domain';

const CLASS_ID = 'private-hours-waitlist-class';
const REGISTRATION_ID = 'private-hours-waitlist-reg';

// Two adjacent hours a week out, on an hour boundary.
const HOUR_MS = 60 * 60 * 1000;
const HOUR_A = new Date(
  Math.ceil((Date.now() + 7 * 24 * HOUR_MS) / HOUR_MS) * HOUR_MS
);
const HOUR_B = new Date(HOUR_A.getTime() + HOUR_MS);

const PERSON_HOUR_A = 'robin.ashfield@example.com';
const PERSON_HOUR_B = 'sam.okafor@example.com';
const PERSON_ANY_HOUR = 'avery.lindqvist@example.com';

interface MailDoc {
  to?: string;
  template?: {
    name?: string;
    data?: { className?: string; classDate?: string; classUrl?: string };
  };
}

function buildPrivateHoursClass(): Record<string, unknown> {
  return {
    name: 'Private Pottery Hour',
    description: 'Test class for the private-hour waitlist.',
    format: 'privateHours',
    sessions: [{ dateTime: HOUR_A.toISOString() }, { dateTime: HOUR_B.toISOString() }],
    firstSessionAt: HOUR_A.toISOString(),
    durationMinutes: 60,
    capacity: 4,
    priceCents: 12000,
    skillLevel: 'beginner',
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function buildRegistration(status: string): Record<string, unknown> {
  return {
    classId: CLASS_ID,
    customerEmail: 'jordan.vale@example.com',
    customerName: 'Jordan Vale',
    quantity: 1,
    groupSize: 2,
    slotStart: new FirestoreTimestamp(HOUR_A),
    pricePaidCents: 12720,
    subtotalCents: 12000,
    taxAmountCents: 720,
    taxRatePercent: 6.0,
    status,
    confirmationNumber: 'MS-HOURWAIT',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function joinWaitlist(email: string, slotStart?: Date): Promise<void> {
  const res = await callFunction<
    { classId: string; email: string; slotStart?: string },
    { added: boolean }
  >({
    functionName: 'addToClassWaitlist',
    data: {
      classId: CLASS_ID,
      email,
      ...(slotStart ? { slotStart: slotStart.toISOString() } : {}),
    },
  });
  expect(res.status, JSON.stringify(res.raw)).toBe(200);
  expect(res.data).toEqual({ added: true });
}

/** The spot-available emails in `mail`, leaving out other triggers' mail. */
async function spotAvailableMail(): Promise<MailDoc[]> {
  const docs = await listFirestoreDocs('mail');
  return docs
    .map((d) => d.data as MailDoc)
    .filter((m) => m.template?.name === 'class-spot-available');
}

async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = TRIGGER_WAIT_TIMEOUT_MS
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let value = await read();
  while (!done(value) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    value = await read();
  }
  return value;
}

async function waitlistEmails(): Promise<string[]> {
  const docs = await listFirestoreDocs(`classes/${CLASS_ID}/waitlist`);
  return docs.map((d) => String(d.data['email'])).sort();
}

describe('private-hour waitlist', () => {
  beforeEach(async () => {
    await clearFirestoreEmulator();
  });

  it('emails the reopened hour and any-hour lists, and keeps a different hour waiting', async () => {
    await setFirestoreDoc('classes', CLASS_ID, buildPrivateHoursClass());
    await setFirestoreDoc('registrations', REGISTRATION_ID, buildRegistration('confirmed'));

    await joinWaitlist(PERSON_HOUR_A, HOUR_A);
    await joinWaitlist(PERSON_HOUR_B, HOUR_B);
    await joinWaitlist(PERSON_ANY_HOUR);

    // Each person has their own entry, and the hour ones carry slotStart.
    const before = await listFirestoreDocs(`classes/${CLASS_ID}/waitlist`);
    expect(before).toHaveLength(3);
    const byEmail = new Map(before.map((d) => [d.data['email'], d.data]));
    expect(new Date(String(byEmail.get(PERSON_HOUR_A)?.['slotStart'])).getTime()).toBe(
      HOUR_A.getTime()
    );
    expect(new Date(String(byEmail.get(PERSON_HOUR_B)?.['slotStart'])).getTime()).toBe(
      HOUR_B.getTime()
    );
    expect(byEmail.get(PERSON_ANY_HOUR)?.['slotStart']).toBeUndefined();

    // The group holding hour A cancels.
    await setFirestoreDoc('registrations', REGISTRATION_ID, buildRegistration('cancelled'));

    const mail = await waitFor(spotAvailableMail, (m) => m.length >= 2);
    expect(mail.map((m) => m.to).sort()).toEqual([PERSON_ANY_HOUR, PERSON_HOUR_A].sort());
    const expectedHour = formatPrivateHour(HOUR_A, 60);
    for (const m of mail) {
      expect(m.template?.data?.className).toBe('Private Pottery Hour');
      expect(m.template?.data?.classDate).toBe(expectedHour);
    }

    // Only the people emailed come off the list; hour B is still waiting.
    const remaining = await waitFor(waitlistEmails, (e) => e.length === 1);
    expect(remaining).toEqual([PERSON_HOUR_B]);

    // The mail batch is one write, so nothing for hour B can still be coming.
    expect((await spotAvailableMail()).map((m) => m.to)).not.toContain(PERSON_HOUR_B);
  });
});
