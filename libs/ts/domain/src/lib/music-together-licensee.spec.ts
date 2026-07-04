import { describe, it, expect } from 'vitest';
import {
  buildMusicTogetherLicenseeCsv,
  mtCsvEscape,
  mtFormatDob,
  MT_LICENSEE_CSV_HEADERS,
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

describe('buildMusicTogetherLicenseeCsv', () => {
  it('emits a header and one row per child', () => {
    const csv = buildMusicTogetherLicenseeCsv([
      {
        parentNames: ['Jamie Rivera'],
        children: [
          { name: 'Sky', dob: new Date('2023-04-01T00:00:00Z') },
          { name: 'River', dob: new Date('2021-08-15T00:00:00Z') },
        ],
      },
      {
        parentNames: ['Pat Lee', 'Sam Lee'],
        children: [{ name: 'Wren', dob: new Date('2022-01-10T00:00:00Z') }],
      },
    ]);
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe(MT_LICENSEE_CSV_HEADERS.join(','));
    expect(lines).toHaveLength(4); // header + 3 children
    expect(lines[1]).toBe('Jamie Rivera,Sky,2023-04-01');
    expect(lines[2]).toBe('Jamie Rivera,River,2021-08-15');
    expect(lines[3]).toBe('Pat Lee; Sam Lee,Wren,2022-01-10');
  });

  it('escapes names containing commas', () => {
    const csv = buildMusicTogetherLicenseeCsv([
      { parentNames: ['Doe, Jane'], children: [{ name: 'Kid', dob: new Date('2023-01-01T00:00:00Z') }] },
    ]);
    expect(csv).toContain('"Doe, Jane",Kid,2023-01-01');
  });

  it('returns just the header for no registrations', () => {
    expect(buildMusicTogetherLicenseeCsv([])).toBe(
      MT_LICENSEE_CSV_HEADERS.join(',') + '\r\n'
    );
  });
});
