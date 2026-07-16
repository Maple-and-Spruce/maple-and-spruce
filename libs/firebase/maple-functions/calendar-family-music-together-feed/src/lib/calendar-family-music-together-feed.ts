/**
 * Per-Family Music Together ICS Feed
 *
 * HTTP endpoint serving a token-scoped ICS feed of ONE family's enrolled Music
 * Together sessions. Unlike the program-wide `calendarMusicTogetherFeed` (all
 * MT events), this feed is keyed by an unguessable per-family capability token
 * carried in the URL path: `/calendar/family/<token>.ics`.
 *
 * The token is the capability — anyone with the URL can read that family's
 * enrolled sessions and nothing else, so the endpoint is public (no auth) but
 * unenumerable. An unknown token yields an empty (valid) calendar rather than a
 * 404, so callers can't probe which tokens exist.
 *
 * The feed auto-updates: it reads live `CalendarEvent`s (kept in sync with each
 * section by `onMusicTogetherSectionWrite`) for every section the family is
 * confirmed in, so registering, cancelling, or a class-time change is reflected
 * within the 5-minute feed TTL.
 *
 * Subscribe via: webcal://…/calendar/family/<token>.ics
 */
import { onRequest } from 'firebase-functions/v2/https';
import {
  CalendarEventRepository,
  MusicTogetherRegistrationRepository,
} from '@maple/firebase/database';
import { generateIcsFeed, ICS_FEED_HEADERS } from '@maple/ts/calendar';
import type { CalendarEvent } from '@maple/ts/domain';

const FEED_NAME = 'Your Music Together Classes';

/**
 * Extract the family token from the request. Prefers the `.ics` path segment
 * (how Firebase Hosting forwards `/calendar/family/<token>.ics`), and falls
 * back to a `?token=` query param so the function is drivable when hit
 * directly (integration tests, the emulator).
 */
export function extractFamilyToken(request: {
  path?: string;
  url?: string;
  query?: Record<string, unknown>;
}): string | undefined {
  const queryToken = request.query?.['token'];
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  // Strip any query/hash, take the last path segment, drop a trailing `.ics`.
  let path = request.path || request.url || '';
  const queryIdx = path.indexOf('?');
  if (queryIdx !== -1) path = path.slice(0, queryIdx);
  const hashIdx = path.indexOf('#');
  if (hashIdx !== -1) path = path.slice(0, hashIdx);
  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  if (!lastSegment.endsWith('.ics')) return undefined;
  const token = lastSegment.slice(0, -'.ics'.length);
  return token.length > 0 ? token : undefined;
}

/**
 * Gather every CalendarEvent for the sections a token's family is confirmed in.
 */
async function collectFamilyEvents(token: string): Promise<CalendarEvent[]> {
  const registrations =
    await MusicTogetherRegistrationRepository.findByCalendarToken(token);
  const sectionIds = Array.from(
    new Set(
      registrations
        .filter((reg) => reg.status === 'confirmed')
        .map((reg) => reg.sectionId)
    )
  );
  if (sectionIds.length === 0) return [];

  const perSection = await Promise.all(
    sectionIds.map((sectionId) =>
      CalendarEventRepository.findAllBySourceRef(
        `musicTogetherSections/${sectionId}`
      )
    )
  );
  return perSection.flat();
}

export const calendarFamilyMusicTogetherFeed = onRequest(
  // No minInstances — the 5-minute CDN cache from ICS_FEED_HEADERS absorbs
  // cold starts, and each family polls at most every few minutes.
  { region: 'us-east4', cors: true, concurrency: 80 },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    const token = extractFamilyToken(request);
    if (!token) {
      response.status(400).json({ error: 'Missing family calendar token' });
      return;
    }

    try {
      const events = await collectFamilyEvents(token);
      // Unknown token or no confirmed sections → an empty but valid calendar,
      // so the endpoint never reveals whether a token exists.
      const ics = generateIcsFeed(events, FEED_NAME);

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(ics);
    } catch (error) {
      console.error('Error generating family Music Together feed:', error);
      response.status(500).json({ error: 'Failed to generate feed' });
    }
  }
);
