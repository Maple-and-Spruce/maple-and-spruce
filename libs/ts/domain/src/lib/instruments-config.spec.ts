import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INSTRUMENT_OPTIONS,
  instrumentChoices,
  instrumentKeyFromLabel,
  instrumentLabel,
  instrumentListProblem,
  isAllowedInstrument,
  unofferedRateInstruments,
} from './instruments-config';

const options = [
  { key: 'violin', label: 'Violin' },
  { key: 'fiddle', label: 'Old-Time Fiddle' },
];

describe('the default list', () => {
  it('is what the studio teaches: violin, fiddle, guitar, harp', () => {
    expect(DEFAULT_INSTRUMENT_OPTIONS.map((o) => o.key)).toEqual([
      'violin',
      'fiddle',
      'guitar',
      'harp',
    ]);
    expect(instrumentListProblem(DEFAULT_INSTRUMENT_OPTIONS)).toBeNull();
  });
});

describe('instrumentKeyFromLabel', () => {
  it.each([
    ['Violin', 'violin'],
    ['  Mountain Dulcimer ', 'mountain-dulcimer'],
    ['Old-Time Fiddle!', 'old-time-fiddle'],
  ])('%s → %s', (label, key) => {
    expect(instrumentKeyFromLabel(label)).toBe(key);
  });
});

describe('instrumentLabel', () => {
  it('uses the configured name', () => {
    expect(instrumentLabel('fiddle', options)).toBe('Old-Time Fiddle');
  });

  it('still names an instrument that is no longer offered', () => {
    expect(instrumentLabel('cello', options)).toBe('Cello');
  });

  it('makes an unknown key readable', () => {
    expect(instrumentLabel('mountain-dulcimer', options)).toBe('Mountain dulcimer');
  });
});

describe('instrumentChoices', () => {
  it('is the configured list for a new record', () => {
    expect(instrumentChoices(options)).toEqual(options);
  });

  it('keeps a retired instrument a record already has, so editing does not change it', () => {
    expect(instrumentChoices(options, 'cello').map((o) => o.key)).toEqual([
      'violin',
      'fiddle',
      'cello',
    ]);
  });

  it('does not duplicate an offered one', () => {
    expect(instrumentChoices(options, 'violin')).toEqual(options);
  });
});

describe('isAllowedInstrument', () => {
  it('allows what is offered', () => {
    expect(isAllowedInstrument('violin', options)).toBe(true);
  });

  it('refuses what is not', () => {
    expect(isAllowedInstrument('piano', options)).toBe(false);
  });

  it('allows keeping what the record already had', () => {
    expect(isAllowedInstrument('piano', options, 'piano')).toBe(true);
  });
});

describe('instrumentListProblem', () => {
  it('refuses an empty list', () => {
    expect(instrumentListProblem([])).toMatch(/at least one/);
  });

  it('refuses a blank name', () => {
    expect(instrumentListProblem([{ key: 'violin', label: '  ' }])).toMatch(/name/);
  });

  it('refuses a duplicate key or name', () => {
    expect(
      instrumentListProblem([
        { key: 'violin', label: 'Violin' },
        { key: 'violin', label: 'Violin (Suzuki)' },
      ])
    ).toMatch(/twice/);
    expect(
      instrumentListProblem([
        { key: 'violin', label: 'Violin' },
        { key: 'violin-2', label: 'violin' },
      ])
    ).toMatch(/twice/);
  });

  it('refuses a malformed key', () => {
    expect(instrumentListProblem([{ key: 'Violin ', label: 'Violin' }])).toMatch(
      /invalid key/
    );
  });
});

describe('unofferedRateInstruments', () => {
  it('names rate instruments the studio does not offer', () => {
    expect(
      unofferedRateInstruments({ violin: {}, piano: {} }, options)
    ).toEqual(['piano']);
  });

  it('lets an instructor keep rates they already had', () => {
    expect(
      unofferedRateInstruments({ violin: {}, piano: {} }, options, { piano: {} })
    ).toEqual([]);
  });

  it('is empty with no rates', () => {
    expect(unofferedRateInstruments(undefined, options)).toEqual([]);
  });
});
