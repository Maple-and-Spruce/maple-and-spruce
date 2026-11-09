/**
 * Staff email when a Music Together family gives accommodations (#327)
 *
 * The Music Together twin of `registration-note-alert.ts`. The family's
 * `accommodations` (special needs, allergies) is what they typed; `notes` on
 * an MT registration is written by the system, so it is not alerted on.
 *
 * Fired from `sendMusicTogetherConversion` on the (created-or-pending) ->
 * `confirmed` transition, rather than adding a function (ADR-029). Once per
 * registration via `noteAlertSentAt`, claimed in a transaction. Never throws.
 */
import { defineString } from 'firebase-functions/params';
import {
  MusicTogetherRegistrationRepository,
  MusicTogetherSectionRepository,
  getDb,
} from '@maple/firebase/database';

/** Staff inbox for operational alerts. Shared with the class job. */
const adminAlertEmail = defineString('ADMIN_ALERT_EMAIL', {
  default: 'katie@mapleandsprucefolkarts.com',
});

/** Base URL of the admin portal, for the link to Music Together. */
const adminPortalUrl = defineString('ADMIN_PORTAL_URL', {
  description: 'Admin portal origin, used to link staff alerts to records',
  default: 'https://business.mapleandsprucefolkarts.com',
});

/** The fields of a raw MT registration document this alert reads. */
export interface MusicTogetherNoteAlertData {
  status?: string;
  sectionId?: string;
  adultFirstName?: string;
  adultLastName?: string;
  accommodations?: string | null;
  noteAlertSentAt?: unknown;
}

/**
 * Whether this write should alert staff: the registration just became
 * `confirmed`, has accommodations, and has not been alerted yet.
 */
export function shouldAlertAccommodations(
  before: MusicTogetherNoteAlertData | undefined,
  after: MusicTogetherNoteAlertData | undefined
): boolean {
  if (!after || after.status !== 'confirmed') return false;
  if (before?.status === 'confirmed') return false;
  if (after.noteAlertSentAt) return false;
  return Boolean(after.accommodations?.trim());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface MusicTogetherNoteAlertContent {
  subject: string;
  text: string;
  html: string;
}

/** Build the staff email for one family's accommodations. */
export function buildMusicTogetherNoteAlert(input: {
  data: MusicTogetherNoteAlertData;
  sectionName?: string;
  portalUrl: string;
}): MusicTogetherNoteAlertContent {
  const { data } = input;
  const note = (data.accommodations ?? '').trim();
  const who =
    [data.adultFirstName, data.adultLastName]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ') || 'A family';
  const section = input.sectionName ?? 'Music Together';
  const link = `${input.portalUrl.replace(/\/+$/, '')}/music-together`;

  const subject = `Accommodations on a Music Together registration: ${section}`;
  const text = [
    `${who} listed accommodations when they enrolled:`,
    '',
    note,
    '',
    `Section: ${section}`,
    '',
    `Open Music Together: ${link}`,
  ].join('\n');
  const html = [
    `<p>${escapeHtml(who)} listed accommodations when they enrolled:</p>`,
    `<blockquote>${escapeHtml(note).replace(/\n/g, '<br>')}</blockquote>`,
    `<p><strong>Section</strong>: ${escapeHtml(section)}</p>`,
    `<p><a href="${escapeHtml(link)}">Open Music Together in the admin portal</a></p>`,
  ].join('\n');

  return { subject, text, html };
}

/**
 * Email staff about a newly confirmed family's accommodations, once. Never
 * throws. Returns whether an email was queued.
 */
export async function alertStaffOfAccommodationsIfConfirmed(
  registrationId: string,
  before: MusicTogetherNoteAlertData | undefined,
  after: MusicTogetherNoteAlertData | undefined,
  now: Date = new Date(),
  logger: Pick<Console, 'log' | 'error'> = console
): Promise<boolean> {
  if (!shouldAlertAccommodations(before, after)) return false;
  const data = after as MusicTogetherNoteAlertData;

  let claimed = false;
  try {
    claimed = await MusicTogetherRegistrationRepository.claimNoteAlert(
      registrationId,
      now
    );
    if (!claimed) return false;

    const section = data.sectionId
      ? await MusicTogetherSectionRepository.findById(data.sectionId).catch(
          () => undefined
        )
      : undefined;
    const message = buildMusicTogetherNoteAlert({
      data,
      sectionName: section?.name,
      portalUrl: adminPortalUrl.value(),
    });
    await getDb().collection('mail').add({ to: adminAlertEmail.value(), message });
    logger.log(
      `[musicTogetherNoteAlert] Registration ${registrationId}: accommodations emailed to staff.`
    );
    return true;
  } catch (err) {
    logger.error(
      `[musicTogetherNoteAlert] Failed for registration ${registrationId}`,
      err
    );
    if (claimed) {
      await MusicTogetherRegistrationRepository.releaseNoteAlert(
        registrationId
      ).catch(() => undefined);
    }
    return false;
  }
}
