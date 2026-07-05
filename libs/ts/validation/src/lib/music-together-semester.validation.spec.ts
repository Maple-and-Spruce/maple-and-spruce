import { describe, it, expect } from 'vitest';
import {
  musicTogetherSemesterValidation,
  type MusicTogetherSemesterValidationInput,
} from './music-together-semester.validation';

function valid(
  overrides: Partial<MusicTogetherSemesterValidationInput> = {}
): MusicTogetherSemesterValidationInput {
  return {
    name: 'Fall 2026',
    season: 'fall',
    year: 2026,
    status: 'planned',
    ...overrides,
  };
}

describe('musicTogetherSemesterValidation', () => {
  it('accepts a minimal valid semester', () => {
    const result = musicTogetherSemesterValidation(valid());
    expect(result.hasErrors()).toBe(false);
  });

  it('requires a name', () => {
    const result = musicTogetherSemesterValidation(valid({ name: '' }));
    expect(result.hasErrors('name')).toBe(true);
  });

  it('rejects an invalid season', () => {
    const result = musicTogetherSemesterValidation(valid({ season: 'autumn' }));
    expect(result.hasErrors('season')).toBe(true);
  });

  it('rejects an out-of-range year', () => {
    expect(
      musicTogetherSemesterValidation(valid({ year: 1999 })).hasErrors('year')
    ).toBe(true);
    expect(
      musicTogetherSemesterValidation(valid({ year: undefined })).hasErrors('year')
    ).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const result = musicTogetherSemesterValidation(
      valid({ startDate: '2026-11-12', endDate: '2026-09-10' })
    );
    expect(result.hasErrors('endDate')).toBe(true);
  });

  it('accepts a valid start/end span', () => {
    const result = musicTogetherSemesterValidation(
      valid({ startDate: '2026-09-10', endDate: '2026-11-12' })
    );
    expect(result.hasErrors('endDate')).toBe(false);
  });

  it('validates breaks (label + dates + order)', () => {
    const bad = musicTogetherSemesterValidation(
      valid({ breaks: [{ label: '', startDate: '2026-12-18', endDate: '2027-01-06' }] })
    );
    expect(bad.hasErrors('breaks')).toBe(true);

    const badOrder = musicTogetherSemesterValidation(
      valid({ breaks: [{ label: 'Holiday', startDate: '2027-01-06', endDate: '2026-12-18' }] })
    );
    expect(badOrder.hasErrors('breaks')).toBe(true);

    const ok = musicTogetherSemesterValidation(
      valid({ breaks: [{ label: 'Holiday', startDate: '2026-12-18', endDate: '2027-01-06' }] })
    );
    expect(ok.hasErrors('breaks')).toBe(false);
  });

  it('rejects an invalid status', () => {
    const result = musicTogetherSemesterValidation(valid({ status: 'archived' }));
    expect(result.hasErrors('status')).toBe(true);
  });

  it('supports partial (single-field) validation for updates', () => {
    // Only validating `name`; a bad season shouldn't be flagged.
    const result = musicTogetherSemesterValidation(
      { name: 'Winter 2027', season: 'autumn' },
      'name'
    );
    expect(result.hasErrors('name')).toBe(false);
    expect(result.hasErrors('season')).toBe(false);
  });
});
