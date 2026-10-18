/**
 * Under-minimum enrollment alert
 *
 * Contract instructors set a minimum headcount for their class. About one
 * week before a class's FIRST session, if confirmed seats are below that
 * minimum, email staff (ADMIN_ALERT_EMAIL) so Katie can decide what to do.
 *
 * Deliberately alert-only: this never cancels a class, refunds anyone, or
 * emails students. Staff act by hand.
 *
 * Runs inside the daily class job (`runSendClassReminders`) rather than as
 * its own function: see ADR-029 and the function-count ratchet.
 *
 * Once per class: `ClassRepository.claimUnderMinimumAlert` stamps
 * `underMinimumAlertSentAt` in a transaction before the mail is queued, so a
 * rerun, or the admin trigger racing the schedule, never sends twice.
 */
import { defineString } from 'firebase-functions/params';
import {
  ClassRepository,
  InstructorRepository,
  RegistrationRepository,
  getDb,
} from '@maple/firebase/database';
import { getSortedSessions, type Class } from '@maple/ts/domain';
import { TIMEZONE, getEtDayWindow } from './et-day-window';

/** How many ET calendar days before the first session the check runs. */
export const UNDER_MINIMUM_ALERT_DAYS_BEFORE = 7;

/**
 * Staff inbox for operational alerts. Shared with `processPosSale`; set per
 * environment in `.env.dev` / `.env.prod` so dev never emails the prod inbox.
 */
const adminAlertEmail = defineString('ADMIN_ALERT_EMAIL', {
  default: 'katie@mapleandsprucefolkarts.com',
});

/** Base URL of the admin portal, for the link to the class in the alert. */
const adminPortalUrl = defineString('ADMIN_PORTAL_URL', {
  description: 'Admin portal origin, used to link staff alerts to records',
  default: 'https://business.mapleandsprucefolkarts.com',
});

export interface UnderMinimumAlertResult {
  /** Published classes with a minimum whose first session is 7 days out */
  classesChecked: number;
  /** Alerts queued this run */
  alertsSent: number;
  /** Classes at or above their minimum */
  skippedMinimumMet: number;
  /** Classes below minimum that were already alerted on an earlier run */
  skippedAlreadyAlerted: number;
}

/**
 * The classes this run should check: published, with a positive minimum,
 * and whose earliest session falls on the ET day 7 days from `now`.
 */
export function selectClassesForMinimumCheck(
  classes: Class[],
  now: Date
): Class[] {
  const { start, end } = getEtDayWindow(now, UNDER_MINIMUM_ALERT_DAYS_BEFORE);
  return classes.filter((c) => {
    if (c.status !== 'published') return false;
    if (typeof c.minimumEnrollment !== 'number' || c.minimumEnrollment < 1) {
      return false;
    }
    const first = getSortedSessions(c)[0];
    return first !== undefined && first.dateTime >= start && first.dateTime <= end;
  });
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

export interface UnderMinimumAlertContent {
  subject: string;
  text: string;
  html: string;
}

/** Build the staff email for one under-minimum class. */
export function buildUnderMinimumAlert(input: {
  classEntity: Class;
  instructorName?: string;
  confirmedCount: number;
  minimum: number;
  portalUrl: string;
}): UnderMinimumAlertContent {
  const { classEntity, instructorName, confirmedCount, minimum } = input;
  const sessions = getSortedSessions(classEntity);
  const when = formatSessionStart(sessions[0].dateTime);
  const whenLabel =
    sessions.length > 1 ? `${when} (first of ${sessions.length} sessions)` : when;
  const link = `${input.portalUrl.replace(/\/+$/, '')}/classes/${classEntity.id}/roster`;

  const rows: Array<[string, string]> = [
    ['Class', classEntity.name],
    ['When', whenLabel],
    ['Instructor', instructorName ?? 'Not set'],
    ['Confirmed', String(confirmedCount)],
    ['Minimum', String(minimum)],
  ];

  const subject = `Below minimum: ${classEntity.name}, ${confirmedCount} of ${minimum} confirmed`;

  const text = [
    `This class starts in about a week and has fewer confirmed seats than its minimum.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Open the class: ${link}`,
    '',
    'Nothing has been cancelled, refunded or sent to students. This is the only alert for this class.',
  ].join('\n');

  const html = [
    '<p>This class starts in about a week and has fewer confirmed seats than its minimum.</p>',
    '<table cellpadding="4">',
    ...rows.map(
      ([label, value]) =>
        `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`
    ),
    '</table>',
    `<p><a href="${escapeHtml(link)}">Open the class in the admin portal</a></p>`,
    '<p>Nothing has been cancelled, refunded or sent to students. This is the only alert for this class.</p>',
  ].join('\n');

  return { subject, text, html };
}

/**
 * Check every candidate class and alert staff about the ones below minimum.
 * `publishedClasses` is the job's existing `findAll({ status: 'published' })`
 * result, so this adds no extra class query.
 */
export async function runUnderMinimumAlerts(
  publishedClasses: Class[],
  now: Date
): Promise<UnderMinimumAlertResult> {
  const candidates = selectClassesForMinimumCheck(publishedClasses, now);
  const result: UnderMinimumAlertResult = {
    classesChecked: candidates.length,
    alertsSent: 0,
    skippedMinimumMet: 0,
    skippedAlreadyAlerted: 0,
  };

  for (const classEntity of candidates) {
    const minimum = classEntity.minimumEnrollment as number;

    // Seats, not documents: a registration can hold several (`quantity`).
    const confirmedCount = await RegistrationRepository.countByClassId(
      classEntity.id,
      ['confirmed']
    );
    if (confirmedCount >= minimum) {
      result.skippedMinimumMet += 1;
      continue;
    }

    // Cheap pre-check from the already-loaded doc; the claim below is the
    // authoritative, race-safe one.
    if (classEntity.underMinimumAlertSentAt) {
      result.skippedAlreadyAlerted += 1;
      continue;
    }
    const claimed = await ClassRepository.claimUnderMinimumAlert(
      classEntity.id,
      now
    );
    if (!claimed) {
      result.skippedAlreadyAlerted += 1;
      continue;
    }

    try {
      const instructorName = classEntity.instructorId
        ? (await InstructorRepository.findById(classEntity.instructorId))?.name
        : undefined;
      const message = buildUnderMinimumAlert({
        classEntity,
        instructorName,
        confirmedCount,
        minimum,
        portalUrl: adminPortalUrl.value(),
      });
      await getDb()
        .collection('mail')
        .add({ to: adminAlertEmail.value(), message });
      result.alertsSent += 1;
      console.log(
        `[underMinimumAlert] Class ${classEntity.id}: ${confirmedCount}/${minimum} confirmed; alert queued.`
      );
    } catch (error) {
      // Give the claim back so a rerun today (the admin trigger) can retry,
      // and don't let one class's failure stop the rest of the job.
      console.error(
        `[underMinimumAlert] Failed to queue alert for class ${classEntity.id}; releasing claim.`,
        error
      );
      await ClassRepository.releaseUnderMinimumAlert(classEntity.id);
    }
  }

  return result;
}
