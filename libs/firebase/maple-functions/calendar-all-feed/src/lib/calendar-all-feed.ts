/**
 * Calendar All Events ICS Feed
 *
 * HTTP endpoint serving a combined ICS feed of all public calendar events.
 * Subscribe via: /calendar/all.ics
 */
import { onRequest } from 'firebase-functions/v2/https';
import { CalendarEventRepository } from '@maple/firebase/database';
import { generateIcsFeed, ICS_FEED_HEADERS } from '@maple/ts/calendar';

export const calendarAllFeed = onRequest(
  { region: 'us-east4', cors: true, concurrency: 80 },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      const events = await CalendarEventRepository.findPublic();
      const ics = generateIcsFeed(events, 'Maple & Spruce Calendar');

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(ics);
    } catch (error) {
      console.error('Error generating all events feed:', error);
      response.status(500).json({ error: 'Failed to generate feed' });
    }
  }
);
