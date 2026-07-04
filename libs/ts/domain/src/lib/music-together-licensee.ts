/**
 * Music Together licensee report
 *
 * The Music Together license requires a per-section export of every enrolled
 * child: the parent/guardian name(s), the child's name, and the child's date
 * of birth. This builds that report as CSV — one row per child.
 *
 * Pure and dependency-free so it can be unit-tested and reused on the server
 * (a CSV-returning endpoint) or the client (a download button).
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

/** Column headers for the licensee report, in order. */
export const MT_LICENSEE_CSV_HEADERS = [
  'Parent(s)',
  'Child Name',
  'Child DOB',
] as const;

/**
 * Build the licensee CSV for a set of registrations — one row per child.
 * Parents are joined with '; '. Caller decides which registrations to include
 * (typically confirmed enrollments).
 */
export function buildMusicTogetherLicenseeCsv(
  registrations: Pick<MusicTogetherRegistration, 'parentNames' | 'children'>[]
): string {
  const rows: string[][] = [[...MT_LICENSEE_CSV_HEADERS]];
  for (const reg of registrations) {
    const parents = reg.parentNames.join('; ');
    for (const child of reg.children) {
      rows.push([parents, child.name, mtFormatDob(child.dob)]);
    }
  }
  return rows.map((row) => row.map(mtCsvEscape).join(',')).join('\r\n') + '\r\n';
}
