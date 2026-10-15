import { describe, expect, it } from 'vitest';
import {
  GA4_STREAM_COOKIE_SUFFIX,
  parseGaClientId,
  parseGaSessionId,
  readGaAttribution,
} from './ga-attribution';

const sessionCookie = `_ga_${GA4_STREAM_COOKIE_SUFFIX}`;

describe('parseGaClientId', () => {
  it('takes the last two segments of the _ga cookie', () => {
    expect(parseGaClientId('GA1.1.1234567890.1700000000')).toBe(
      '1234567890.1700000000'
    );
  });

  it('handles a multi-level domain prefix', () => {
    expect(parseGaClientId('GA1.2.987.654')).toBe('987.654');
  });

  it('rejects malformed values', () => {
    expect(parseGaClientId(undefined)).toBeUndefined();
    expect(parseGaClientId('GA1.1.abc.def')).toBeUndefined();
    expect(parseGaClientId('1234.5678')).toBeUndefined();
  });
});

describe('parseGaSessionId', () => {
  it('reads the current GS2 format', () => {
    expect(
      parseGaSessionId('GS2.1.s1700000000$o5$g1$t1700000300$j0$l0$h0')
    ).toBe('1700000000');
  });

  it('reads the older GS1 format', () => {
    expect(parseGaSessionId('GS1.1.1700000000.5.1.1700000300.0.0.0')).toBe(
      '1700000000'
    );
  });

  it('rejects anything else', () => {
    expect(parseGaSessionId(undefined)).toBeUndefined();
    expect(parseGaSessionId('GS3.1.whatever')).toBeUndefined();
    expect(parseGaSessionId('GS2.1.oops')).toBeUndefined();
  });
});

describe('readGaAttribution', () => {
  it('reads both ids from document.cookie', () => {
    const win = {
      document: {
        cookie: `_fbp=fb.1.1.1; _ga=GA1.1.111.222; ${sessionCookie}=GS2.1.s1700000000$o1$g0$t1700000001`,
      },
    };
    expect(readGaAttribution(win)).toEqual({
      clientId: '111.222',
      sessionId: '1700000000',
    });
  });

  it('ignores another stream’s session cookie', () => {
    const win = {
      document: {
        cookie: '_ga=GA1.1.111.222; _ga_OTHERSTREAM=GS2.1.s1700000000$o1',
      },
    };
    expect(readGaAttribution(win)).toEqual({ clientId: '111.222' });
  });

  it('returns an empty object when GA has not set cookies', () => {
    expect(readGaAttribution({ document: { cookie: '' } })).toEqual({});
    expect(readGaAttribution(null)).toEqual({});
  });

  it('never throws when cookies are inaccessible', () => {
    const win = {
      document: {
        get cookie(): string {
          throw new Error('SecurityError');
        },
      },
    };
    expect(readGaAttribution(win)).toEqual({});
  });
});
