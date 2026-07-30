/**
 * Calendar Music Together ICS Feed
 *
 * HTTP endpoint serving an ICS feed of all public Music Together events
 * (type `musictogether`), which are auto-generated from MT sections by
 * `onMusicTogetherSectionWrite` plus any ad-hoc MT events (demo classes,
 * makeups) tagged in the admin calendar. Powers the public Music Together
 * calendar embed.
 *
 * Subscribe via: /calendar/musictogether.ics
 */
import { onRequest } from 'firebase-functions/v2/https';
import { CalendarEventRepository } from '@maple/firebase/database';
import { generateIcsFeed, ICS_FEED_HEADERS } from '@maple/ts/calendar';

export const calendarMusicTogetherFeed = onRequest(
  // No minInstances — the 5-minute CDN cache from ICS_FEED_HEADERS absorbs cold starts.
  { region: 'us-east4', cors: true, concurrency: 80 },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    try {
      const events =
        await CalendarEventRepository.findPublicByType('musictogether');
      const ics = generateIcsFeed(events, 'Music Together Maple & Spruce');

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(ics);
    } catch (error) {
      console.error('Error generating Music Together feed:', error);
      response.status(500).json({ error: 'Failed to generate feed' });
    }
  }
);
