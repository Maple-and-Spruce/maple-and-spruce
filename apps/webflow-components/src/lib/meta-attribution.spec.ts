import { describe, expect, it } from 'vitest';
import {
  fbcFromFbclid,
  readCookie,
  readFbclid,
  readMetaAttribution,
} from './meta-attribution';

describe('readCookie', () => {
  it('reads a value from a multi-cookie string', () => {
    expect(
      readCookie('_ga=GA1.1.1; _fbp=fb.1.100.200; other=x', '_fbp')
    ).toBe('fb.1.100.200');
  });

  it('tolerates whitespace and returns undefined for misses', () => {
    expect(readCookie('  _fbp = fb.1.1.2 ', '_fbp')).toBe('fb.1.1.2');
    expect(readCookie('_ga=1', '_fbp')).toBeUndefined();
    expect(readCookie(undefined, '_fbp')).toBeUndefined();
    expect(readCookie('', '_fbp')).toBeUndefined();
  });

  // A prefix match would return the wrong value — `_fbc` must not satisfy a
  // lookup for `_fb`, and `my_fbp` must not satisfy `_fbp`.
  it('matches the cookie name exactly, not as a prefix or suffix', () => {
    expect(readCookie('my_fbp=nope; _fbp=yes', '_fbp')).toBe('yes');
    expect(readCookie('_fbclid=nope', '_fbc')).toBeUndefined();
  });

  it('treats an empty value as absent', () => {
    expect(readCookie('_fbp=; _fbc=real', '_fbp')).toBeUndefined();
  });

  it('url-decodes the value', () => {
    expect(readCookie('_fbc=fb.1.1.a%2Fb', '_fbc')).toBe('fb.1.1.a/b');
  });
});

describe('readFbclid', () => {
  it('reads fbclid with or without a leading question mark', () => {
    expect(readFbclid('?utm_source=fb&fbclid=IwAR123')).toBe('IwAR123');
    expect(readFbclid('fbclid=IwAR123')).toBe('IwAR123');
  });

  it('returns undefined when absent or empty', () => {
    expect(readFbclid('?utm_source=fb')).toBeUndefined();
    expect(readFbclid('?fbclid=')).toBeUndefined();
    expect(readFbclid(undefined)).toBeUndefined();
  });

  it('does not match a param that merely ends in fbclid', () => {
    expect(readFbclid('?not_fbclid=x')).toBeUndefined();
  });
});

describe('fbcFromFbclid', () => {
  it("builds Meta's fb.<subdomainIndex>.<ms>.<fbclid> format", () => {
    expect(fbcFromFbclid('IwAR123', 1_700_000_000_000)).toBe(
      'fb.1.1700000000000.IwAR123'
    );
  });
});

describe('readMetaAttribution', () => {
  const win = (cookie: string, search = '', href = '') => ({
    document: { cookie },
    location: { search, href },
  });

  it('prefers the real _fbc cookie over synthesizing one from fbclid', () => {
    const attribution = readMetaAttribution(
      win('_fbp=fb.1.1.2; _fbc=fb.1.1.realclick', '?fbclid=IwAR999')
    );
    expect(attribution).toMatchObject({
      fbp: 'fb.1.1.2',
      fbc: 'fb.1.1.realclick',
    });
  });

  // The buyer can land from an ad and submit before fbevents.js writes _fbc;
  // synthesizing from the URL is what preserves click attribution there.
  it('synthesizes _fbc from fbclid when the cookie is missing', () => {
    const attribution = readMetaAttribution(
      win('_fbp=fb.1.1.2', '?fbclid=IwAR999')
    );
    expect(attribution.fbc).toMatch(/^fb\.1\.\d+\.IwAR999$/);
  });

  it('strips the query string and hash from the event source url', () => {
    const attribution = readMetaAttribution(
      win('', '?fbclid=x', 'https://example.com/classes/pottery?fbclid=x#top')
    );
    expect(attribution.eventSourceUrl).toBe(
      'https://example.com/classes/pottery'
    );
  });

  it('returns an empty object when nothing is available', () => {
    expect(readMetaAttribution(win(''))).toEqual({});
    expect(readMetaAttribution(null)).toEqual({});
    expect(readMetaAttribution(undefined)).toEqual({});
  });

  // A privacy extension or sandboxed iframe can make document.cookie throw.
  // Checkout must never break because of a marketing cookie read.
  it('never throws when cookie access blows up', () => {
    const hostile = {
      get document() {
        throw new Error('blocked by sandbox');
      },
    };
    expect(() => readMetaAttribution(hostile)).not.toThrow();
    expect(readMetaAttribution(hostile)).toEqual({});
  });
});
