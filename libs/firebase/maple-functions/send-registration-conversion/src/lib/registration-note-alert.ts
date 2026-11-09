/**
 * Staff email when a registration comes in with a customer note (#327)
 *
 * Customers can leave a note at checkout (an allergy, an accessibility need,
 * a question). It shows on the Home Inbox and the class roster, but those
 * are only seen when someone opens the portal; this emails staff
 * (ADMIN_ALERT_EMAIL) as soon as the registration is confirmed.
 *
 * Fired from `sendRegistrationConversion`, which already watches the
 * registration's (created-or-pending) -> `confirmed` transition that every
 * paid path converges on (inline checkout, hosted fallback). It rides on that
 * trigger rather than adding a function: see ADR-029.
 *
 * Once per registration: `RegistrationRepository.claimNoteAlert` stamps
 * `noteAlertSentAt` in a transaction before the mail is queued, so a
 * re-delivered trigger never sends twice. Never throws: a failed email must
 * not disturb the registration or the other beacons.
 */
import { defineString } from 'firebase-functions/params';
import {
  ClassRepository,
  RegistrationRepository,
  getDb,
} from '@maple/firebase/database';

/** Staff inbox for operational alerts. Shared with the class job. */
const adminAlertEmail = defineString('ADMIN_ALERT_EMAIL', {
  default: 'katie@mapleandsprucefolkarts.com',
});

/** Base URL of the admin portal, for the link to the registration. */
const adminPortalUrl = defineString('ADMIN_PORTAL_URL', {
  description: 'Admin portal origin, used to link staff alerts to records',
  default: 'https://business.mapleandsprucefolkarts.com',
});

const TIMEZONE = 'America/New_York';

/** The fields of a raw registration document this alert reads. */
export interface NoteAlertRegistrationData {
  status?: string;
  classId?: string;
  customerName?: string;
  quantity?: number;
  notes?: string | null;
  noteAlertSentAt?: unknown;
}

/**
 * Whether this write should alert staff: the registration just became
 * `confirmed`, carries a non-blank note, and has not been alerted yet.
 */
export function shouldAlertNote(
  before: NoteAlertRegistrationData | undefined,
  after: NoteAlertRegistrationData | undefined
): boolean {
  if (!after || after.status !== 'confirmed') return false;
  if (before?.status === 'confirmed') return false;
  if (after.noteAlertSentAt) return false;
  return Boolean(after.notes?.trim()) && Boolean(after.classId);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWhen(d: Date): string {
  const date = d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} at ${time}`;
}

export interface NoteAlertContent {
  subject: string;
  text: string;
  html: string;
}

/** Build the staff email for one noted registration. */
export function buildRegistrationNoteAlert(input: {
  registrationId: string;
  data: NoteAlertRegistrationData;
  className?: string;
  firstSessionAt?: Date;
  portalUrl: string;
}): NoteAlertContent {
  const { data } = input;
  const note = (data.notes ?? '').trim();
  const className = input.className ?? 'a class';
  const who = data.customerName?.trim() || 'A customer';
  const link = `${input.portalUrl.replace(/\/+$/, '')}/classes/${data.classId}/roster?registration=${input.registrationId}`;

  const rows: Array<[string, string]> = [
    ['Class', input.className ?? 'Unknown class'],
    ...(input.firstSessionAt
      ? [['Starts', formatWhen(input.firstSessionAt)] as [string, string]]
      : []),
    ['Who', (data.quantity ?? 1) > 1 ? `${who} (${data.quantity} spots)` : who],
  ];

  const subject = `Note on a registration: ${className}`;
  const text = [
    `${who} left a note when they registered:`,
    '',
    note,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `Open the registration: ${link}`,
  ].join('\n');
  const html = [
    `<p>${escapeHtml(who)} left a note when they registered:</p>`,
    `<blockquote>${escapeHtml(note).replace(/\n/g, '<br>')}</blockquote>`,
    '<table cellpadding="4">',
    ...rows.map(
      ([label, value]) =>
        `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`
    ),
    '</table>',
    `<p><a href="${escapeHtml(link)}">Open the registration in the admin portal</a></p>`,
  ].join('\n');

  return { subject, text, html };
}

/**
 * Email staff about a newly confirmed registration's note, once. Never
 * throws. Returns whether an email was queued.
 */
export async function alertStaffOfNoteIfConfirmed(
  registrationId: string,
  before: NoteAlertRegistrationData | undefined,
  after: NoteAlertRegistrationData | undefined,
  now: Date = new Date(),
  logger: Pick<Console, 'log' | 'error'> = console
): Promise<boolean> {
  if (!shouldAlertNote(before, after)) return false;
  const data = after as NoteAlertRegistrationData;

  let claimed = false;
  try {
    claimed = await RegistrationRepository.claimNoteAlert(registrationId, now);
    if (!claimed) return false;

    const cls = await ClassRepository.findById(data.classId as string).catch(
      () => undefined
    );
    const first = cls?.sessions
      ?.map((s) => new Date(s.dateTime))
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const message = buildRegistrationNoteAlert({
      registrationId,
      data,
      className: cls?.name,
      firstSessionAt: first,
      portalUrl: adminPortalUrl.value(),
    });
    await getDb().collection('mail').add({ to: adminAlertEmail.value(), message });
    logger.log(`[registrationNoteAlert] Registration ${registrationId}: note emailed to staff.`);
    return true;
  } catch (err) {
    logger.error(`[registrationNoteAlert] Failed for registration ${registrationId}`, err);
    if (claimed) {
      // Give the claim back so a later re-delivery can retry.
      await RegistrationRepository.releaseNoteAlert(registrationId).catch(() => undefined);
    }
    return false;
  }
}
