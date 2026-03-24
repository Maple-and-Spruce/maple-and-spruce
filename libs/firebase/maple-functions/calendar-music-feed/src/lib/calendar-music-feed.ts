/**
 * Calendar Music ICS Feed
 *
 * HTTP endpoint serving an ICS feed of all public music lesson events.
 * Subscribe via: /calendar/music.ics
 */
import { onRequest } from 'firebase-functions/v2/https';
import { CalendarEventRepository } from '@maple/firebase/database';
import { generateIcsFeed, ICS_FEED_HEADERS } from '@maple/ts/calendar';

export const calendarMusicFeed = onRequest(
  { region: 'us-east4', cors: true, concurrency: 80 },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      const events = await CalendarEventRepository.findPublicByType('lesson');
      const ics = generateIcsFeed(events, 'Maple & Spruce Music Lessons');

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(ics);
    } catch (error) {
      console.error('Error generating music feed:', error);
      response.status(500).json({ error: 'Failed to generate feed' });
    }
  }
);
