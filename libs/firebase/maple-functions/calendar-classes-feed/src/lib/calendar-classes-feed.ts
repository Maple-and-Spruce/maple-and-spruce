/**
 * Calendar Classes ICS Feed
 *
 * HTTP endpoint serving an ICS feed of all public class events.
 * Subscribe via: /calendar/classes.ics
 */
import { onRequest } from 'firebase-functions/v2/https';
import { CalendarEventRepository } from '@maple/firebase/database';
import { generateIcsFeed, ICS_FEED_HEADERS } from '@maple/ts/calendar';

export const calendarClassesFeed = onRequest(
  { region: 'us-east4', cors: true, minInstances: 1, concurrency: 80 },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      const events = await CalendarEventRepository.findPublicByType('class');
      const ics = generateIcsFeed(events, 'Maple & Spruce Classes');

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(ics);
    } catch (error) {
      console.error('Error generating classes feed:', error);
      response.status(500).json({ error: 'Failed to generate feed' });
    }
  }
);
