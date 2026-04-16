import { describe, it, expect } from 'vitest';
import { getCalendarEventTypeLabel, type CalendarEventType } from './calendar-event';

describe('calendar-event domain helpers', () => {
  describe('getCalendarEventTypeLabel', () => {
    it.each<[CalendarEventType, string]>([
      ['class', 'Class'],
      ['lesson', 'Music Lesson'],
      ['event', 'Event'],
      ['jam', 'Jam Session'],
      ['hours', 'Store Hours'],
    ])('returns "%s" → "%s"', (type, expected) => {
      expect(getCalendarEventTypeLabel(type)).toBe(expected);
    });
  });
});
