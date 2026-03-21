/**
 * Standard ICS feed response headers
 */
export const ICS_FEED_HEADERS = {
  'Content-Type': 'text/calendar; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'X-PUBLISHED-TTL': 'PT5M',
  'Content-Disposition': 'inline',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
} as const;
