/**
 * Public calendar feed catalog.
 *
 * Every entry maps to a `hosting` (target `api`) rewrite in `firebase.json`
 * that resolves to an `ics-generator` Cloud Function. The list here is kept in
 * sync with those rewrites so staff have one place to find, copy, and subscribe
 * to each feed.
 */

/** Prod hosting origin that serves the `/calendar/*` rewrites. */
export const CALENDAR_FEED_BASE_URL = 'https://maple-and-spruce-api.web.app';

/** Who a feed is intended for — drives the on-page grouping. */
export type CalendarFeedAudience = 'public' | 'internal';

/**
 * How a feed is consumed:
 * - `subscribe` — an `.ics` feed offering a `webcal://` subscribe link and an
 *   `https://` view/download link.
 * - `view` — a browser redirect (the embed) presented as a view link only, with
 *   no `webcal://` subscribe form.
 */
export type CalendarFeedKind = 'subscribe' | 'view';

export interface CalendarFeed {
  /** Stable key used for React lists and copy tracking. */
  id: string;
  /** Friendly display name. */
  name: string;
  /** One-line description of what the feed contains. */
  description: string;
  /** Path served from the hosting site, e.g. `/calendar/all.ics`. */
  path: string;
  /** Customer-facing vs staff-only. */
  audience: CalendarFeedAudience;
  /** Subscribable ICS feed vs a view-only redirect. */
  kind: CalendarFeedKind;
}

export const CALENDAR_FEEDS: readonly CalendarFeed[] = [
  {
    id: 'all',
    name: 'All public events',
    description: 'Everything public in one feed — classes, music, events, and hours.',
    path: '/calendar/all.ics',
    audience: 'public',
    kind: 'subscribe',
  },
  {
    id: 'classes',
    name: 'Classes',
    description: 'Scheduled classes and their sessions.',
    path: '/calendar/classes.ics',
    audience: 'public',
    kind: 'subscribe',
  },
  {
    id: 'music',
    name: 'Music lessons',
    description: 'Private and group music lesson sessions.',
    path: '/calendar/music.ics',
    audience: 'public',
    kind: 'subscribe',
  },
  {
    id: 'musictogether',
    name: 'Music Together',
    description: 'Music Together semester class sessions.',
    path: '/calendar/musictogether.ics',
    audience: 'public',
    kind: 'subscribe',
  },
  {
    id: 'events',
    name: 'Events & workshops',
    description: 'One-off events and workshops.',
    path: '/calendar/events.ics',
    audience: 'public',
    kind: 'subscribe',
  },
  {
    id: 'hours',
    name: 'Studio open hours',
    description: 'When the studio is open to the public.',
    path: '/calendar/hours.ics',
    audience: 'public',
    kind: 'subscribe',
  },
  {
    id: 'adhoc',
    name: 'Ad-hoc calendar',
    description: 'Proxy of the ad-hoc Google calendar for one-off happenings.',
    path: '/calendar/adhoc.ics',
    audience: 'public',
    kind: 'subscribe',
  },
  {
    id: 'embed',
    name: 'Public calendar (browser view)',
    description:
      'Redirect to the Open Web Calendar view. Open in a browser — this is not a subscribe feed.',
    path: '/calendar/embed',
    audience: 'public',
    kind: 'view',
  },
  {
    id: 'private',
    name: 'Internal planning feed',
    description: 'Staff-only planning feed. Do not share with customers.',
    path: '/calendar/private.ics',
    audience: 'internal',
    kind: 'subscribe',
  },
];

/** Absolute `https://` URL for a feed. */
export function httpsUrl(feed: CalendarFeed): string {
  return `${CALENDAR_FEED_BASE_URL}${feed.path}`;
}

/** Absolute `webcal://` subscribe URL for a feed (only meaningful for `subscribe` feeds). */
export function webcalUrl(feed: CalendarFeed): string {
  return httpsUrl(feed).replace(/^https:\/\//, 'webcal://');
}
