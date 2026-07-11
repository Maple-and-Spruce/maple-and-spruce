import { describe, it, expect } from 'vitest';
import {
  buildMusicTogetherLicenseeCsv,
  buildMusicTogetherInternalRosterCsv,
  mtCsvEscape,
  mtFormatDob,
  MT_LICENSEE_CSV_HEADERS,
  MT_INTERNAL_ROSTER_CSV_HEADERS,
} from './music-together-licensee';

describe('mtCsvEscape', () => {
  it('leaves plain values untouched', () => {
    expect(mtCsvEscape('Jamie Rivera')).toBe('Jamie Rivera');
  });
  it('quotes and doubles quotes when the value has commas/quotes/newlines', () => {
    expect(mtCsvEscape('Doe, Jane')).toBe('"Doe, Jane"');
    expect(mtCsvEscape('a "b" c')).toBe('"a ""b"" c"');
    expect(mtCsvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('mtFormatDob', () => {
  it('renders a calendar date as YYYY-MM-DD', () => {
    expect(mtFormatDob(new Date('2023-04-01T00:00:00Z'))).toBe('2023-04-01');
  });
});

describe('buildMusicTogetherLicenseeCsv (Music Together Worldwide)', () => {
  it('emits a header and one row per family — adult contact only, no children', () => {
    const csv = buildMusicTogetherLicenseeCsv([
      {
        adultFirstName: 'Jamie',
        adultLastName: 'Rivera',
        email: 'jamie@example.com',
        address: '123 Spruce St, Morgantown WV',
      },
      {
        adultFirstName: 'Pat',
        adultLastName: 'Lee',
        email: 'pat@example.com',
        address: '9 Oak Ave, Morgantown WV',
      },
    ]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(MT_LICENSEE_CSV_HEADERS.join(','));
    expect(lines).toHaveLength(3); // header + 2 families
    expect(lines[1]).toBe('Jamie,Rivera,jamie@example.com,"123 Spruce St, Morgantown WV"');
    expect(lines[2]).toBe('Pat,Lee,pat@example.com,"9 Oak Ave, Morgantown WV"');
  });

  it('never includes any child information', () => {
    const csv = buildMusicTogetherLicenseeCsv([
      {
        adultFirstName: 'Jamie',
        adultLastName: 'Rivera',
        email: 'jamie@example.com',
        address: '123 Spruce St',
      },
    ]);
    expect(csv).not.toContain('Child');
    expect(csv.toLowerCase()).not.toContain('dob');
  });

  it('returns just the header for no registrations', () => {
    expect(buildMusicTogetherLicenseeCsv([])).toBe(
      MT_LICENSEE_CSV_HEADERS.join(',') + '\r\n'
    );
  });
});

describe('buildMusicTogetherInternalRosterCsv (Maple & Spruce only)', () => {
  it('emits a header and one row per child, with accommodations/notes', () => {
    const csv = buildMusicTogetherInternalRosterCsv([
      {
        adultFirstName: 'Jamie',
        adultLastName: 'Rivera',
        email: 'jamie@example.com',
        phone: '304-555-1212',
        children: [
          { name: 'Sky', dob: new Date('2023-04-01T00:00:00Z') },
          { name: 'River', dob: new Date('2021-08-15T00:00:00Z') },
        ],
        accommodations: 'Peanut allergy',
        notes: 'Prefers Saturdays',
      },
      {
        adultFirstName: 'Pat',
        adultLastName: 'Lee',
        email: 'pat@example.com',
        phone: '304-555-0000',
        children: [{ name: 'Wren', dob: new Date('2022-01-10T00:00:00Z') }],
        accommodations: undefined,
        notes: undefined,
      },
    ]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(MT_INTERNAL_ROSTER_CSV_HEADERS.join(','));
    expect(lines).toHaveLength(4); // header + 3 children
    expect(lines[1]).toBe(
      'Jamie,Rivera,jamie@example.com,304-555-1212,Sky,2023-04-01,Peanut allergy,Prefers Saturdays'
    );
    expect(lines[2]).toBe(
      'Jamie,Rivera,jamie@example.com,304-555-1212,River,2021-08-15,Peanut allergy,Prefers Saturdays'
    );
    // Missing accommodations/notes render as empty fields.
    expect(lines[3]).toBe(
      'Pat,Lee,pat@example.com,304-555-0000,Wren,2022-01-10,,'
    );
  });

  it('returns just the header for no registrations', () => {
    expect(buildMusicTogetherInternalRosterCsv([])).toBe(
      MT_INTERNAL_ROSTER_CSV_HEADERS.join(',') + '\r\n'
    );
  });
});
