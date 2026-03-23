/**
 * Configuration for public calendar ICS feed sources.
 *
 * Feed URLs are served via Firebase Hosting rewrites on the API site.
 * Colors use the MUI theme palette names for consistency.
 */

export interface CalendarFeedSource {
  id: string;
  label: string;
  url: string;
  /** MUI palette color for the legend and FullCalendar events */
  color: string;
  /** If true, render as FullCalendar background events */
  background?: boolean;
}

function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('-dev.')) {
      return 'https://maple-and-spruce-dev.web.app';
    }
  }
  const firebaseEnv = process.env['NEXT_PUBLIC_FIREBASE_ENV'];
  if (firebaseEnv === 'dev') {
    return 'https://maple-and-spruce-dev.web.app';
  }
  return 'https://maple-and-spruce-api.web.app';
}

export function getCalendarFeedSources(): CalendarFeedSource[] {
  const base = getApiBaseUrl();
  return [
    {
      id: 'classes',
      label: 'Classes & Workshops',
      url: `${base}/calendar/classes.ics`,
      color: '#6B7B5E', // sage green (secondary)
    },
    {
      id: 'music',
      label: 'Music Lessons',
      url: `${base}/calendar/music.ics`,
      color: '#4A3728', // dark brown (primary)
    },
    {
      id: 'events',
      label: 'Events & Jams',
      url: `${base}/calendar/events.ics`,
      color: '#C17817', // warm amber
    },
    {
      id: 'hours',
      label: 'Store Hours',
      url: `${base}/calendar/hours.ics`,
      color: '#7A7A6E', // warm gray
      background: true,
    },
    {
      id: 'adhoc',
      label: 'Special Events',
      url: `${base}/calendar/adhoc.ics`,
      color: '#5C8A97', // teal blue
    },
  ];
}
