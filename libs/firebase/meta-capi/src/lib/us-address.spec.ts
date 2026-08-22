import { describe, expect, it } from 'vitest';
import { parseUsAddress } from './us-address';

describe('parseUsAddress', () => {
  it('parses the comma-delimited form families actually type', () => {
    expect(parseUsAddress('123 Main St, Morgantown, WV 26505')).toEqual({
      city: 'Morgantown',
      state: 'wv',
      zip: '26505',
    });
  });

  it('parses the run-on form, without mistaking the street for a city', () => {
    // No comma to lean on, so the city cannot be identified with confidence —
    // and a wrong `ct` hash is worse than none. State + ZIP still land.
    expect(parseUsAddress('123 Main St Morgantown WV 26505')).toEqual({
      state: 'wv',
      zip: '26505',
    });
  });

  it('parses a city + state segment that shares one comma group', () => {
    expect(parseUsAddress('456 Elm Ave, Morgantown WV 26505')).toEqual({
      city: 'Morgantown',
      state: 'wv',
      zip: '26505',
    });
  });

  it('maps a spelled-out state name to the abbreviation Meta indexes', () => {
    // `west virginia` hashes to something Meta has never seen.
    expect(parseUsAddress('12 Oak Rd, Fairmont, West Virginia 26554')).toEqual({
      city: 'Fairmont',
      state: 'wv',
      zip: '26554',
    });
  });

  it('handles a two-word state name in the run-on form', () => {
    expect(parseUsAddress('99 Broadway, Brooklyn New York 11211')).toEqual({
      city: 'Brooklyn',
      state: 'ny',
      zip: '11211',
    });
  });

  it('truncates ZIP+4 down to the 5-digit ZIP', () => {
    expect(parseUsAddress('1 A St, Morgantown, WV 26505-1234').zip).toBe('26505');
  });

  it('parses partial addresses', () => {
    expect(parseUsAddress('Morgantown, WV')).toEqual({
      city: 'Morgantown',
      state: 'wv',
    });
    expect(parseUsAddress('WV 26505')).toEqual({ state: 'wv', zip: '26505' });
  });

  it('returns nothing it cannot identify, rather than guessing', () => {
    // Every one of these would otherwise produce a match key that resolves to
    // nobody while presenting as supplied data.
    expect(parseUsAddress('')).toEqual({});
    expect(parseUsAddress(null)).toEqual({});
    expect(parseUsAddress(undefined)).toEqual({});
    expect(parseUsAddress('123 Main Street')).toEqual({});
  });

  it('does not read an English word as a state code', () => {
    // `me`, `in`, `or`, `ok`, `hi`, `la`, `pa`, `id` are all USPS codes. A bare
    // one with no ZIP and no comma structure around it is far more likely to be
    // a word, and guessing ships a state hash for the wrong part of the country.
    expect(parseUsAddress('ask me')).toEqual({});
    expect(parseUsAddress('call or text')).toEqual({});
    expect(parseUsAddress('pick up in')).toEqual({});
  });

  it('still trusts a bare code when a ZIP or a comma group vouches for it', () => {
    expect(parseUsAddress('4 Cedar Ln, Portland, ME 04101')).toMatchObject({
      state: 'me',
      zip: '04101',
    });
    expect(parseUsAddress('Portland, ME')).toEqual({
      city: 'Portland',
      state: 'me',
    });
  });

  it('never mistakes a street number for a ZIP', () => {
    // The ZIP match is anchored to the END of the string on purpose.
    expect(parseUsAddress('26505 Country Club Rd')).toEqual({});
  });

  it('tolerates a trailing state abbreviation written with a period', () => {
    expect(parseUsAddress('7 Pine Ct, Bruceton Mills, W.V. 26525')).toMatchObject(
      { zip: '26525' }
    );
  });
});
