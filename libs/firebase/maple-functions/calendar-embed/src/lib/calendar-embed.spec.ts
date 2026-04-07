import { describe, expect, it } from 'vitest';

import { getHostingBaseUrl } from './calendar-embed';

describe('getHostingBaseUrl', () => {
  it('uses the request host when invoked through Firebase Hosting (prod)', () => {
    expect(
      getHostingBaseUrl({
        hostname: 'maple-and-spruce-api.web.app',
        protocol: 'https',
      })
    ).toBe('https://maple-and-spruce-api.web.app');
  });

  it('uses the request host when invoked through Firebase Hosting (dev)', () => {
    expect(
      getHostingBaseUrl({
        hostname: 'maple-and-spruce-dev.web.app',
        protocol: 'https',
      })
    ).toBe('https://maple-and-spruce-dev.web.app');
  });

  it('falls back to the prod hosting domain when invoked directly via cloudfunctions.net', () => {
    // Regression: previously matched `includes('maple-and-spruce')` and
    // returned the cloudfunctions.net host, which cannot serve the
    // /calendar/*.ics hosting rewrites.
    expect(
      getHostingBaseUrl({
        hostname: 'us-east4-maple-and-spruce.cloudfunctions.net',
        protocol: 'https',
      })
    ).toBe('https://maple-and-spruce-api.web.app');
  });

  it('falls back to the dev hosting domain when invoked directly via cloudfunctions.net (dev project)', () => {
    expect(
      getHostingBaseUrl({
        hostname: 'us-east4-maple-and-spruce-dev.cloudfunctions.net',
        protocol: 'https',
      })
    ).toBe('https://maple-and-spruce-dev.web.app');
  });

  it('falls back to a hosting domain when invoked directly via run.app', () => {
    expect(
      getHostingBaseUrl({
        hostname: 'calendarembed-abc123-uk.a.run.app',
        protocol: 'https',
      })
    ).toBe('https://maple-and-spruce-api.web.app');
  });
});
