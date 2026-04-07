/**
 * Calendar Embed HTTP Endpoint
 *
 * Public endpoint that reads the calendar embed configuration from Firestore
 * and redirects to the Open Web Calendar instance with the appropriate parameters.
 * This provides a stable URL for embedding in Webflow.
 */
import { onRequest } from 'firebase-functions/v2/https';
import { CalendarEmbedConfigRepository } from '@maple/firebase/database';

/**
 * Resolve a source URL that may be a path (e.g. "/calendar/classes.ics")
 * to a full URL using the request's host as the base for system feeds.
 */
function resolveSourceUrl(url: string, hostingBaseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${hostingBaseUrl}${url}`;
}

/**
 * Determine the Firebase Hosting base URL from the request.
 *
 * Relative source paths (e.g. "/calendar/classes.ics") rely on Firebase
 * Hosting rewrites in firebase.json, which only apply on the hosting
 * domain — not when the function is invoked directly via its
 * cloudfunctions.net or run.app URL. When invoked directly, fall back to
 * the known hosting domain for the matching environment.
 *
 * In production: https://maple-and-spruce-api.web.app
 * In dev:        https://maple-and-spruce-dev.web.app
 */
export function getHostingBaseUrl(req: { hostname: string; protocol: string }): string {
  const isFunctionDirect =
    req.hostname.endsWith('.cloudfunctions.net') ||
    req.hostname.endsWith('.run.app');

  // Requests through Firebase Hosting can use their own host directly.
  if (!isFunctionDirect && req.hostname.includes('maple-and-spruce')) {
    return `${req.protocol}://${req.hostname}`;
  }

  // Fallback: pick the hosting site based on the project ID embedded in
  // the hostname (works for both cloudfunctions.net and run.app).
  const isDev = req.hostname.includes('maple-and-spruce-dev');
  return isDev
    ? 'https://maple-and-spruce-dev.web.app'
    : 'https://maple-and-spruce-api.web.app';
}

export const calendarEmbed = onRequest(
  { region: 'us-east4', cors: true },
  async (request, response) => {
    try {
      const config = await CalendarEmbedConfigRepository.get();
      const hostingBaseUrl = getHostingBaseUrl(request);

      // Build OWC URL with enabled sources
      const enabledSources = config.sources.filter((s) => s.enabled);
      const params = new URLSearchParams();

      for (const source of enabledSources) {
        params.append('url', resolveSourceUrl(source.url, hostingBaseUrl));
      }

      params.set('tab', config.defaultTab);
      for (const tab of config.tabs) {
        params.append('tabs', tab);
      }
      params.set('skin', config.skin);
      params.set('start_of_week', config.startOfWeek);
      if (config.timezone) {
        params.set('timezone', config.timezone);
      }
      if (config.title) {
        params.set('title', config.title);
      }
      if (config.cssUrl) {
        params.set('css_url', config.cssUrl);
      }

      const owcUrl = `${config.owcBaseUrl}/calendar.html?${params.toString()}`;
      response.redirect(302, owcUrl);
    } catch (error) {
      console.error('Error generating calendar embed redirect:', error);
      response.status(500).json({ error: 'Failed to load calendar configuration' });
    }
  }
);
