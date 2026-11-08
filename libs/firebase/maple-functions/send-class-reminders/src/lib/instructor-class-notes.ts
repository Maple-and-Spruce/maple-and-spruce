/**
 * Customer notes for the instructor (#325)
 *
 * Customers can leave a note when they register (an allergy, an
 * accessibility need, a question). Class instructors have no portal login,
 * so the day before a class's FIRST session, email the class's instructor
 * the notes left on registrations that still hold a seat.
 *
 * Only sent when there is at least one note, and only to an instructor with
 * an email on file. Replies go to the studio (ADMIN_ALERT_EMAIL), so a
 * question about a note reaches staff, not a no-reply box.
 *
 * Runs inside the daily class job (`runSendClassReminders`) rather than as
 * its own function: see ADR-029 and the function-count ratchet.
 *
 * Once per class: `ClassRepository.claimInstructorNotesEmail` stamps
 * `instructorNotesSentAt` in a transaction before the mail is queued, so a
 * rerun, or the admin trigger racing the schedule, never sends twice. A note
 * left after that email has gone is on the admin roster and Home Inbox.
 */
import { defineString } from 'firebase-functions/params';
import { isE2ETestEmail } from '@maple/firebase/functions';
import {
  ClassRepository,
  InstructorRepository,
  RegistrationRepository,
  getDb,
} from '@maple/firebase/database';
import {
  formatPrivateHourStart,
  getSortedSessions,
  type Class,
  type Registration,
} from '@maple/ts/domain';
import { TIMEZONE, getEtDayWindow } from './et-day-window';

/** How many ET calendar days before the first session the email goes. */
export const INSTRUCTOR_NOTES_DAYS_BEFORE = 1;

/** Statuses that hold a seat: the people who are coming. */
const SEAT_STATUSES: ReadonlySet<Registration['status']> = new Set([
  'confirmed',
  'pending',
]);

/** Replies go to the studio inbox. Shared with the under-minimum alert. */
const adminAlertEmail = defineString('ADMIN_ALERT_EMAIL', {
  default: 'katie@mapleandsprucefolkarts.com',
});

export interface InstructorNotesResult {
  /** Published classes with an instructor whose first session is tomorrow */
  classesChecked: number;
  /** Emails queued this run */
  emailsSent: number;
  /** Classes where nobody holding a seat left a note */
  skippedNoNotes: number;
  /** Classes whose instructor has no email on file */
  skippedNoEmail: number;
  /** Classes already emailed on an earlier run */
  skippedAlreadySent: number;
}

export const EMPTY_INSTRUCTOR_NOTES_RESULT: InstructorNotesResult = {
  classesChecked: 0,
  emailsSent: 0,
  skippedNoNotes: 0,
  skippedNoEmail: 0,
  skippedAlreadySent: 0,
};

/**
 * The classes this run should check: published, with an instructor, and
 * whose earliest session falls on the ET day after `now`.
 */
export function selectClassesForInstructorNotes(
  classes: Class[],
  now: Date
): Class[] {
  const { start, end } = getEtDayWindow(now, INSTRUCTOR_NOTES_DAYS_BEFORE);
  return classes.filter((c) => {
    if (c.status !== 'published' || !c.instructorId) return false;
    const first = getSortedSessions(c)[0];
    return first !== undefined && first.dateTime >= start && first.dateTime <= end;
  });
}

/** Registrations holding a seat that carry a customer note, oldest first. */
export function notedSeatHolders(registrations: Registration[]): Registration[] {
  return registrations
    .filter((r) => SEAT_STATUSES.has(r.status) && r.notes?.trim())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function formatSessionStart(d: Date): string {
  const date = d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} at ${time}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Robin Ashfield (2 spots, 10:00–11:00 AM)" */
function who(registration: Registration): string {
  const extras: string[] = [];
  if (registration.slotStart) {
    extras.push(formatPrivateHourStart(registration.slotStart));
  } else if (registration.quantity > 1) {
    extras.push(`${registration.quantity} spots`);
  }
  const name = registration.customerName?.trim() || 'A customer';
  return extras.length > 0 ? `${name} (${extras.join(', ')})` : name;
}

export interface InstructorNotesContent {
  subject: string;
  text: string;
  html: string;
}

/** Build the instructor's email for one class. */
export function buildInstructorNotesEmail(input: {
  classEntity: Class;
  instructorName?: string;
  noted: Registration[];
}): InstructorNotesContent {
  const { classEntity, noted } = input;
  const sessions = getSortedSessions(classEntity);
  const when = formatSessionStart(sessions[0].dateTime);
  const firstName = input.instructorName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const count =
    noted.length === 1
      ? 'One person coming to'
      : `${noted.length} people coming to`;
  const intro = `${count} ${classEntity.name} (${when}) left a note when they registered:`;
  const closing =
    'Questions about any of these? Reply to this email and it will reach the studio.';

  const subject = `Notes from your students: ${classEntity.name}, tomorrow`;

  const text = [
    greeting,
    '',
    intro,
    '',
    ...noted.map((r) => `- ${who(r)}: ${(r.notes ?? '').trim()}`),
    '',
    closing,
    '',
    'Maple & Spruce',
  ].join('\n');

  const html = [
    `<p>${escapeHtml(greeting)}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    '<ul>',
    ...noted.map(
      (r) =>
        `<li><strong>${escapeHtml(who(r))}</strong>: ${escapeHtml((r.notes ?? '').trim()).replace(/\n/g, '<br>')}</li>`
    ),
    '</ul>',
    `<p>${escapeHtml(closing)}</p>`,
    '<p>Maple &amp; Spruce</p>',
  ].join('\n');

  return { subject, text, html };
}

/**
 * Email each candidate class's instructor the notes on its seats.
 * `publishedClasses` is the job's existing `findAll({ status: 'published' })`
 * result, so this adds no extra class query.
 */
export async function runInstructorClassNotes(
  publishedClasses: Class[],
  now: Date
): Promise<InstructorNotesResult> {
  const candidates = selectClassesForInstructorNotes(publishedClasses, now);
  const result: InstructorNotesResult = {
    ...EMPTY_INSTRUCTOR_NOTES_RESULT,
    classesChecked: candidates.length,
  };

  for (const classEntity of candidates) {
    // Cheap pre-check from the already-loaded doc; the claim below is the
    // authoritative, race-safe one.
    if (classEntity.instructorNotesSentAt) {
      result.skippedAlreadySent += 1;
      continue;
    }

    const noted = notedSeatHolders(
      await RegistrationRepository.findByClassId(classEntity.id)
    );
    if (noted.length === 0) {
      result.skippedNoNotes += 1;
      continue;
    }

    const instructor = await InstructorRepository.findById(
      classEntity.instructorId as string
    );
    const to = instructor?.email?.trim();
    if (!to || isE2ETestEmail(to)) {
      result.skippedNoEmail += 1;
      continue;
    }

    const claimed = await ClassRepository.claimInstructorNotesEmail(
      classEntity.id,
      now
    );
    if (!claimed) {
      result.skippedAlreadySent += 1;
      continue;
    }

    try {
      const message = buildInstructorNotesEmail({
        classEntity,
        instructorName: instructor?.name,
        noted,
      });
      await getDb()
        .collection('mail')
        .add({ to, replyTo: adminAlertEmail.value(), message });
      result.emailsSent += 1;
      console.log(
        `[instructorClassNotes] Class ${classEntity.id}: ${noted.length} note(s) emailed to its instructor.`
      );
    } catch (error) {
      // Give the claim back so a rerun today (the admin trigger) can retry,
      // and don't let one class's failure stop the rest of the job.
      console.error(
        `[instructorClassNotes] Failed to queue notes for class ${classEntity.id}; releasing claim.`,
        error
      );
      await ClassRepository.releaseInstructorNotesEmail(classEntity.id);
    }
  }

  return result;
}
