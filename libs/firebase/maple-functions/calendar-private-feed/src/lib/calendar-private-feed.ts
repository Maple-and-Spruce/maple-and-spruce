/**
 * Calendar Private Planning ICS Feed
 *
 * HTTP endpoint serving an ICS feed of all PRIVATE (public == false) calendar
 * events — the room-occupying blocks the public feeds omit: music lessons
 * (auto-titled "Music Lesson", no student names) and any ad-hoc private events
 * tagged in the admin calendar.
 *
 * Intended as a SUPPLEMENT to /calendar/all.ics: subscribe to both in Google
 * Calendar and they overlay into a complete planning view (public events from
 * all.ics + private room bookings from here), with no duplication.
 *
 * Unauthenticated but unlisted. It carries no student names by construction —
 * lesson events are pre-sanitized upstream, and the admin policy is to keep
 * personal data out of private event titles. Do NOT add authentication-gated
 * data here.
 *
 * Subscribe via: /calendar/private.ics
 */
import { onRequest } from 'firebase-functions/v2/https';
import { CalendarEventRepository } from '@maple/firebase/database';
import { generateIcsFeed, ICS_FEED_HEADERS } from '@maple/ts/calendar';

export const calendarPrivateFeed = onRequest(
  // No minInstances — the 5-minute CDN cache from ICS_FEED_HEADERS absorbs cold starts.
  { region: 'us-east4', cors: true, concurrency: 80 },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      const events = await CalendarEventRepository.findPrivate();
      const ics = generateIcsFeed(events, 'Maple & Spruce Planning');

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(ics);
    } catch (error) {
      console.error('Error generating private planning feed:', error);
      response.status(500).json({ error: 'Failed to generate feed' });
    }
  }
);
