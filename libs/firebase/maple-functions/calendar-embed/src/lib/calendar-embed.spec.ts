import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@maple/firebase/database', () => ({
  CalendarEmbedConfigRepository: {
    get: mocks.get,
  },
}));

import {
  getHostingBaseUrl,
  handleCalendarEmbedRequest,
  resolveSourceUrl,
  type CalendarEmbedResponse,
} from './calendar-embed';

function makeResponse(): {
  res: CalendarEmbedResponse;
  set: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const set = vi.fn();
  const redirect = vi.fn();
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return {
    res: { set, redirect, status } as CalendarEmbedResponse,
    set,
    redirect,
    status,
    json,
  };
}

const baseConfig = {
  owcBaseUrl: 'https://open-web-calendar-thz2.vercel.app',
  defaultTab: 'month',
  tabs: ['month', 'week', 'agenda'],
  skin: 'material',
  startOfWeek: 'su',
  timezone: 'America/New_York',
  title: 'Maple & Spruce Calendar',
  cssUrl: 'https://open-web-calendar-thz2.vercel.app/css/maple-spruce.css',
  sources: [
    {
      id: 'system-classes',
      label: 'Classes & Workshops',
      url: '/calendar/classes.ics',
      color: '6B7B5E',
      isSystem: true,
      enabled: true,
    },
    {
      id: 'system-music',
      label: 'Music Lessons',
      url: '/calendar/music.ics',
      color: '4A3728',
      isSystem: true,
      enabled: true,
    },
    {
      id: 'disabled-source',
      label: 'Disabled',
      url: '/calendar/disabled.ics',
      color: '000000',
      isSystem: false,
      enabled: false,
    },
    {
      id: 'custom-google',
      label: 'Custom Google',
      url: 'https://calendar.google.com/calendar/ical/example/public/basic.ics',
      color: 'C17817',
      isSystem: false,
      enabled: true,
    },
  ],
  updatedAt: new Date('2026-04-01T00:00:00Z'),
};

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

describe('resolveSourceUrl', () => {
  it('returns absolute https URLs unchanged', () => {
    expect(
      resolveSourceUrl(
        'https://calendar.google.com/calendar/ical/x/public/basic.ics',
        'https://maple-and-spruce-api.web.app'
      )
    ).toBe('https://calendar.google.com/calendar/ical/x/public/basic.ics');
  });

  it('returns absolute http URLs unchanged', () => {
    expect(
      resolveSourceUrl('http://example.com/feed.ics', 'https://ignored')
    ).toBe('http://example.com/feed.ics');
  });

  it('prefixes relative paths with the hosting base URL', () => {
    expect(
      resolveSourceUrl('/calendar/classes.ics', 'https://maple-and-spruce-api.web.app')
    ).toBe('https://maple-and-spruce-api.web.app/calendar/classes.ics');
  });
});

describe('handleCalendarEmbedRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to OWC with resolved sources, settings, and css', async () => {
    mocks.get.mockResolvedValue(baseConfig);
    const { res, redirect } = makeResponse();

    await handleCalendarEmbedRequest(
      { hostname: 'maple-and-spruce-api.web.app', protocol: 'https' },
      res
    );

    expect(redirect).toHaveBeenCalledTimes(1);
    const [status, url] = redirect.mock.calls[0];
    expect(status).toBe(302);
    expect(url).toContain('https://open-web-calendar-thz2.vercel.app/calendar.html?');

    const params = new URL(url).searchParams;
    const sourceUrls = params.getAll('url');

    // Two enabled system sources are resolved against the hosting host,
    // the disabled source is excluded, and the custom absolute source is
    // passed through unchanged.
    expect(sourceUrls).toEqual([
      'https://maple-and-spruce-api.web.app/calendar/classes.ics',
      'https://maple-and-spruce-api.web.app/calendar/music.ics',
      'https://calendar.google.com/calendar/ical/example/public/basic.ics',
    ]);

    expect(params.get('tab')).toBe('month');
    expect(params.getAll('tabs')).toEqual(['month', 'week', 'agenda']);
    expect(params.get('skin')).toBe('material');
    expect(params.get('start_of_week')).toBe('su');
    expect(params.get('timezone')).toBe('America/New_York');
    expect(params.get('title')).toBe('Maple & Spruce Calendar');
    expect(params.get('css_url')).toBe(
      'https://open-web-calendar-thz2.vercel.app/css/maple-spruce.css'
    );
  });

  it('rewrites relative system sources to the hosting domain when invoked via cloudfunctions.net', async () => {
    mocks.get.mockResolvedValue(baseConfig);
    const { res, redirect } = makeResponse();

    await handleCalendarEmbedRequest(
      {
        hostname: 'us-east4-maple-and-spruce.cloudfunctions.net',
        protocol: 'https',
      },
      res
    );

    const url = redirect.mock.calls[0][1] as string;
    const sourceUrls = new URL(url).searchParams.getAll('url');
    expect(sourceUrls).toContain(
      'https://maple-and-spruce-api.web.app/calendar/classes.ics'
    );
    expect(sourceUrls).not.toContain(
      'https://us-east4-maple-and-spruce.cloudfunctions.net/calendar/classes.ics'
    );
  });

  it('omits optional params when blank', async () => {
    mocks.get.mockResolvedValue({
      ...baseConfig,
      timezone: '',
      title: '',
      cssUrl: '',
    });
    const { res, redirect } = makeResponse();

    await handleCalendarEmbedRequest(
      { hostname: 'maple-and-spruce-api.web.app', protocol: 'https' },
      res
    );

    const params = new URL(redirect.mock.calls[0][1] as string).searchParams;
    expect(params.has('timezone')).toBe(false);
    expect(params.has('title')).toBe(false);
    expect(params.has('css_url')).toBe(false);
  });

  it('sets Cache-Control headers on the redirect response', async () => {
    mocks.get.mockResolvedValue(baseConfig);
    const { res, set } = makeResponse();

    await handleCalendarEmbedRequest(
      { hostname: 'maple-and-spruce-api.web.app', protocol: 'https' },
      res
    );

    expect(set).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=300, s-maxage=300, stale-while-revalidate=600'
    );
  });

  it('returns 500 JSON when the repository throws', async () => {
    const error = new Error('firestore unavailable');
    mocks.get.mockRejectedValue(error);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res, redirect, status, json } = makeResponse();

    await handleCalendarEmbedRequest(
      { hostname: 'maple-and-spruce-api.web.app', protocol: 'https' },
      res
    );

    expect(redirect).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: 'Failed to load calendar configuration',
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
