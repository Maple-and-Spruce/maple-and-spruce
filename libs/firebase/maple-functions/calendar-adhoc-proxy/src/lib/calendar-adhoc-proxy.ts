/**
 * Calendar Ad-hoc Proxy
 *
 * HTTP proxy for Katie's public Google Calendar ICS feed.
 * Solves CORS issues when fetching the Google Calendar ICS URL client-side.
 *
 * The Google Calendar public ICS URL is configured via Firebase string param.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';
import { ICS_FEED_HEADERS } from '@maple/ts/calendar';

const googleCalendarIcsUrl = defineString('GOOGLE_CALENDAR_ADHOC_ICS_URL', {
  description: "Katie's public Google Calendar ICS URL for ad-hoc events",
  default: '',
});

export const calendarAdhocProxy = onRequest(
  { region: 'us-east4', cors: true },
  async (request, response) => {
    if (request.method === 'OPTIONS') {
      response.status(204).send('');
      return;
    }

    const icsUrl = googleCalendarIcsUrl.value();
    if (!icsUrl) {
      response.status(503).json({
        error: 'Google Calendar ICS URL not configured',
      });
      return;
    }

    try {
      const fetchResponse = await fetch(icsUrl);

      if (!fetchResponse.ok) {
        throw new Error(
          `Google Calendar returned ${fetchResponse.status}: ${fetchResponse.statusText}`
        );
      }

      const icsContent = await fetchResponse.text();

      Object.entries(ICS_FEED_HEADERS).forEach(([key, value]) => {
        response.setHeader(key, value);
      });
      response.status(200).send(icsContent);
    } catch (error) {
      console.error('Error proxying Google Calendar feed:', error);
      response.status(502).json({ error: 'Failed to fetch Google Calendar' });
    }
  }
);
