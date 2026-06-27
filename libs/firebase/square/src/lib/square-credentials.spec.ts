import { describe, it, expect } from 'vitest';
import {
  resolveSquareCredentials,
  DEFAULT_SQUARE_KEYS,
  MT_SQUARE_KEYS,
  MT_SQUARE_SECRET_NAMES,
  MT_SQUARE_STRING_NAMES,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from './square-credentials';

// These tests exercise pure credential-routing logic — which param names each
// account reads. Importing only this barrel-free module keeps the functions +
// database layers out of the coverage denominator (see file header).

const MS_SECRETS = { SQUARE_ACCESS_TOKEN: 'ms-token' };
const MS_STRINGS = {
  SQUARE_ENV: 'LOCAL',
  SQUARE_LOCATION_ID: 'MS_LOC',
  SALES_TAX_RATE: '6.0',
};

const MT_SECRETS = { MT_SQUARE_ACCESS_TOKEN: 'mt-token' };
const MT_STRINGS = {
  MT_SQUARE_ENV: 'LOCAL',
  MT_SQUARE_LOCATION_ID: 'MT_LOC',
  MT_SALES_TAX_RATE: '0.0',
};

describe('param name tuples', () => {
  it('default and MT name sets are disjoint and prefixed', () => {
    expect(SQUARE_SECRET_NAMES).toEqual(['SQUARE_ACCESS_TOKEN']);
    expect(MT_SQUARE_SECRET_NAMES).toEqual(['MT_SQUARE_ACCESS_TOKEN']);
    expect(SQUARE_STRING_NAMES).toContain('SQUARE_LOCATION_ID');
    expect(MT_SQUARE_STRING_NAMES).toEqual([
      'MT_SQUARE_ENV',
      'MT_SQUARE_LOCATION_ID',
      'MT_SALES_TAX_RATE',
    ]);
    // No overlap — MT must never read the M&S account's params.
    const overlap = MT_SQUARE_STRING_NAMES.filter((n) =>
      (SQUARE_STRING_NAMES as readonly string[]).includes(n)
    );
    expect(overlap).toEqual([]);
  });

  it('key sets map to the matching tuples', () => {
    expect(DEFAULT_SQUARE_KEYS.accessTokenSecret).toBe('SQUARE_ACCESS_TOKEN');
    expect(DEFAULT_SQUARE_KEYS.locationIdString).toBe('SQUARE_LOCATION_ID');
    expect(MT_SQUARE_KEYS.accessTokenSecret).toBe('MT_SQUARE_ACCESS_TOKEN');
    expect(MT_SQUARE_KEYS.locationIdString).toBe('MT_SQUARE_LOCATION_ID');
    expect(MT_SQUARE_KEYS.taxRateString).toBe('MT_SALES_TAX_RATE');
  });
});

describe('resolveSquareCredentials', () => {
  it('defaults to the Maple & Spruce account', () => {
    const creds = resolveSquareCredentials(MS_SECRETS, MS_STRINGS);
    expect(creds.accessToken).toBe('ms-token');
    expect(creds.locationId).toBe('MS_LOC');
    expect(creds.taxRatePercent).toBe(6.0);
    expect(creds.isProd).toBe(false);
  });

  it('routes to the Music Together account when given MT keys', () => {
    const creds = resolveSquareCredentials(MT_SECRETS, MT_STRINGS, MT_SQUARE_KEYS);
    expect(creds.accessToken).toBe('mt-token');
    expect(creds.locationId).toBe('MT_LOC');
    expect(creds.taxRatePercent).toBe(0.0); // non-taxable service
  });

  it('reads PROD env per account independently', () => {
    const creds = resolveSquareCredentials(
      { MT_SQUARE_ACCESS_TOKEN: 't' },
      { ...MT_STRINGS, MT_SQUARE_ENV: 'PROD' },
      MT_SQUARE_KEYS
    );
    expect(creds.isProd).toBe(true);
  });

  it('does not read the wrong account’s token', () => {
    // MT keys against only-M&S secrets must fail — proves no cross-account leak.
    expect(() =>
      resolveSquareCredentials(MS_SECRETS, MT_STRINGS, MT_SQUARE_KEYS)
    ).toThrow(/MT_SQUARE_ACCESS_TOKEN/);
  });

  it('throws with the account-specific param name when location is missing', () => {
    expect(() =>
      resolveSquareCredentials(
        MT_SECRETS,
        { ...MT_STRINGS, MT_SQUARE_LOCATION_ID: '' },
        MT_SQUARE_KEYS
      )
    ).toThrow(/MT_SQUARE_LOCATION_ID/);
  });

  it('throws with the account-specific param name when tax rate is invalid', () => {
    expect(() =>
      resolveSquareCredentials(
        MT_SECRETS,
        { ...MT_STRINGS, MT_SALES_TAX_RATE: 'abc' },
        MT_SQUARE_KEYS
      )
    ).toThrow(/MT_SALES_TAX_RATE/);
  });
});
