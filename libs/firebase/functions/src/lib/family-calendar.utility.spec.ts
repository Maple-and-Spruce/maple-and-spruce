import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import {
  generateFamilyCalendarToken,
  apiHostingHost,
  familyCalendarFeedUrl,
  familyCalendarSubscribeUrl,
  FAMILY_CALENDAR_FEED_PATH_PREFIX,
} from './family-calendar.utility';

describe('family-calendar.utility', () => {
  const original = process.env['GCLOUD_PROJECT'];

  beforeEach(() => {
    delete process.env['FIREBASE_CONFIG'];
  });
  afterEach(() => {
    if (original === undefined) delete process.env['GCLOUD_PROJECT'];
    else process.env['GCLOUD_PROJECT'] = original;
  });

  describe('generateFamilyCalendarToken', () => {
    it('produces a long, URL-safe, unpredictable hex token', () => {
      const a = generateFamilyCalendarToken();
      const b = generateFamilyCalendarToken();
      expect(a).toMatch(/^[0-9a-f]{48}$/); // 24 bytes hex
      expect(a).not.toBe(b);
    });
  });

  describe('host + URL builders', () => {
    it('uses the prod host on the prod project', () => {
      process.env['GCLOUD_PROJECT'] = 'maple-and-spruce';
      expect(apiHostingHost()).toBe('maple-and-spruce-api.web.app');
      expect(familyCalendarSubscribeUrl('tok123')).toBe(
        'webcal://maple-and-spruce-api.web.app/calendar/family/tok123.ics'
      );
      expect(familyCalendarFeedUrl('tok123')).toBe(
        'https://maple-and-spruce-api.web.app/calendar/family/tok123.ics'
      );
    });

    it('uses the dev host on the dev project', () => {
      process.env['GCLOUD_PROJECT'] = 'maple-and-spruce-dev';
      expect(apiHostingHost()).toBe('maple-and-spruce-dev.web.app');
      expect(familyCalendarSubscribeUrl('tok')).toBe(
        'webcal://maple-and-spruce-dev.web.app/calendar/family/tok.ics'
      );
    });

    it('exposes the feed path prefix that firebase.json rewrites', () => {
      expect(FAMILY_CALENDAR_FEED_PATH_PREFIX).toBe('/calendar/family/');
    });
  });
});
