/**
 * Music Together CSV exports
 *
 * Two distinct exports with different audiences and privacy boundaries:
 *
 * 1. **Licensee report (Music Together Worldwide).** Enrolling families agree
 *    that the *adult's* name, email, and street address may be shared with MTW
 *    as a licensed center. Children's information is NEVER shared outside Maple
 *    & Spruce, so this export carries adult contact details only — one row per
 *    family. (This replaced an earlier child-level report; see the privacy
 *    notice in the Policies page.)
 *
 * 2. **Internal roster (Maple & Spruce only).** Everything staff need to run
 *    the class, including each child's first name and DOB plus any
 *    accommodations/notes — one row per child. Never leaves Maple & Spruce.
 *
 * Both are pure and dependency-free so they can be unit-tested and reused on
 * the server (a CSV-returning endpoint) or the client (a download button).
 */
import type { MusicTogetherRegistration } from './music-together-registration';

/** RFC-4180 field escaping: quote when the value contains a comma, quote, or newline. */
export function mtCsvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A DOB rendered as a calendar date (YYYY-MM-DD), timezone-independent. */
export function mtFormatDob(dob: Date): string {
  return dob.toISOString().slice(0, 10);
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(mtCsvEscape).join(',')).join('\r\n') + '\r\n';
}

// ============================================================================
// Licensee report — shared with Music Together Worldwide (adults only)
// ============================================================================

/** Column headers for the licensee report, in order. Adult contact only. */
export const MT_LICENSEE_CSV_HEADERS = [
  'Adult First Name',
  'Adult Last Name',
  'Email',
  'Street Address',
] as const;

/** The registration fields the licensee report is allowed to include. */
export type MtLicenseeRegistration = Pick<
  MusicTogetherRegistration,
  'adultFirstName' | 'adultLastName' | 'email' | 'address'
>;

/**
 * Build the licensee CSV for Music Together Worldwide — one row per family,
 * adult contact details only. NO child information is included. Caller decides
 * which registrations to include (typically confirmed enrollments).
 */
export function buildMusicTogetherLicenseeCsv(
  registrations: MtLicenseeRegistration[]
): string {
  const rows: string[][] = [[...MT_LICENSEE_CSV_HEADERS]];
  for (const reg of registrations) {
    rows.push([
      reg.adultFirstName,
      reg.adultLastName,
      reg.email,
      reg.address,
    ]);
  }
  return toCsv(rows);
}

// ============================================================================
// Internal roster — Maple & Spruce only (includes children)
// ============================================================================

/** Column headers for the internal roster, in order. Never shared with MTW. */
export const MT_INTERNAL_ROSTER_CSV_HEADERS = [
  'Adult First Name',
  'Adult Last Name',
  'Email',
  'Phone',
  'Child First Name',
  'Child DOB',
  'Accommodations',
  'Notes',
] as const;

/** The registration fields the internal roster includes. */
export type MtInternalRosterRegistration = Pick<
  MusicTogetherRegistration,
  | 'adultFirstName'
  | 'adultLastName'
  | 'email'
  | 'phone'
  | 'children'
  | 'accommodations'
  | 'notes'
>;

/**
 * Build the internal roster CSV for Maple & Spruce staff — one row per child,
 * with the child's first name + DOB and the family's accommodations/notes.
 * This never leaves Maple & Spruce; do not send it to Music Together Worldwide.
 */
export function buildMusicTogetherInternalRosterCsv(
  registrations: MtInternalRosterRegistration[]
): string {
  const rows: string[][] = [[...MT_INTERNAL_ROSTER_CSV_HEADERS]];
  for (const reg of registrations) {
    for (const child of reg.children) {
      rows.push([
        reg.adultFirstName,
        reg.adultLastName,
        reg.email,
        reg.phone,
        child.name,
        mtFormatDob(child.dob),
        reg.accommodations ?? '',
        reg.notes ?? '',
      ]);
    }
  }
  return toCsv(rows);
}
