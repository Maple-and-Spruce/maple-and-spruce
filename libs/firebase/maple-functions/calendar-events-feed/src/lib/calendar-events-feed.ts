/**
 * Calendar Events & Jams ICS Feed
 *
 * HTTP endpoint serving an ICS feed of all public event and jam session events.
 * Subscribe via: /calendar/events.ics
 */
import { onRequest } from 'firebase-functions/v2/https';
import { CalendarEventRepository } from '@maple/firebase/database';
import { generateIcsFeed, ICS_FEED_HEADERS } from '@maple/ts/calendar';

export const calendarEventsFeed = onRequest(
  { region: 'us-east4', cors: true, concurrency: 80 },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      // Fetch both 'event' and 'jam' types
      const [eventEvents, jamEvents] = await Promise.all([
        CalendarEventRepository.findPublicByType('event'),
        CalendarEventRepository.findPublicByType('jam'),
      ]);
      const allEvents = [...eventEvents, ...jamEvents].sort(
        (a, b) =>
          new Date(a.startDateTime).getTime() -
          new Date(b.startDateTime).getTime()
      );

      const ics = generateIcsFeed(allEvents, 'Maple & Spruce Events & Jams');

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(ics);
    } catch (error) {
      console.error('Error generating events feed:', error);
      response.status(500).json({ error: 'Failed to generate feed' });
    }
  }
);
