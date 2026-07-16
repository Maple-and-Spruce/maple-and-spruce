/**
 * Per-family calendar subscription helpers.
 *
 * A family's Music Together calendar is exposed as a token-scoped ICS feed at
 * `/calendar/family/<token>.ics` (see `calendarFamilyMusicTogetherFeed`). The
 * token is an unguessable capability — anyone holding the URL can read the
 * family's enrolled sessions, and nothing else. It is generated on the family's
 * first registration and reused across their later registrations so one
 * subscribe link tracks all of their sections.
 */
import { randomBytes } from 'node:crypto';

import { FirebaseProject, FIREBASE_PROJECTS } from './environment.utility';

/**
 * Path prefix (under the `api` hosting target) that serves per-family feeds.
 * The matching rewrite lives in `firebase.json` (`/calendar/family/*.ics`).
 */
export const FAMILY_CALENDAR_FEED_PATH_PREFIX = '/calendar/family/';

/**
 * Generate an unguessable per-family calendar token.
 *
 * 24 random bytes → 192 bits of entropy, hex-encoded (URL-safe, no escaping
 * needed). The token IS the capability, so it must never be enumerable or
 * derivable from family data.
 */
export function generateFamilyCalendarToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * The public host for the `api` hosting target in the current project.
 *
 * - prod (`maple-and-spruce`)     → `maple-and-spruce-api.web.app`
 * - dev  (`maple-and-spruce-dev`) → `maple-and-spruce-dev.web.app`
 */
export function apiHostingHost(): string {
  return FirebaseProject.projectId === FIREBASE_PROJECTS.prod
    ? 'maple-and-spruce-api.web.app'
    : 'maple-and-spruce-dev.web.app';
}

/**
 * The `https://` feed URL for a family token (what a browser or ICS client
 * fetches).
 */
export function familyCalendarFeedUrl(token: string): string {
  return `https://${apiHostingHost()}${FAMILY_CALENDAR_FEED_PATH_PREFIX}${token}.ics`;
}

/**
 * The `webcal://` subscribe URL for a family token.
 *
 * `webcal://` is the de-facto scheme calendar clients (Apple Calendar, Google
 * Calendar, Outlook) recognize as "subscribe to this feed and keep it in sync"
 * rather than "download a one-off snapshot". It is otherwise identical to the
 * https URL.
 */
export function familyCalendarSubscribeUrl(token: string): string {
  return `webcal://${apiHostingHost()}${FAMILY_CALENDAR_FEED_PATH_PREFIX}${token}.ics`;
}
