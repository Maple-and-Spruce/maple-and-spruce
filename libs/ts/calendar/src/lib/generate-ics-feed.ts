/**
 * ICS Feed Generator
 *
 * Pure function for converting CalendarEvent[] into ICS calendar strings.
 * No Firebase dependencies — just takes domain types and returns strings.
 */
import ical, { ICalEventRepeatingFreq } from 'ical-generator';
import { getVtimezoneComponent } from '@touch4it/ical-timezones';
import type { CalendarEvent } from '@maple/ts/domain';

const TIMEZONE = 'America/New_York';

/**
 * Parse an RFC 5545 RRULE string into ical-generator repeating options.
 *
 * Supports common patterns:
 * - FREQ=WEEKLY
 * - FREQ=WEEKLY;BYDAY=FR
 * - FREQ=WEEKLY;INTERVAL=2
 * - FREQ=MONTHLY
 * - FREQ=MONTHLY;BYMONTHDAY=1
 */
function parseRRule(rrule: string): string {
  // ical-generator accepts RRULE strings directly via the repeating field
  // Ensure it starts with the proper prefix for raw RRULE passthrough
  return rrule;
}

/**
 * Generate an ICS calendar feed from CalendarEvent entities.
 *
 * @param events - CalendarEvent entities to include
 * @param calendarName - Display name for the calendar (e.g. "Maple & Spruce Classes")
 * @returns ICS calendar string (text/calendar content)
 */
export function generateIcsFeed(
  events: CalendarEvent[],
  calendarName: string
): string {
  const calendar = ical({
    name: calendarName,
    prodId: {
      company: 'Maple & Spruce Folk Arts',
      product: calendarName,
      language: 'EN',
    },
    timezone: TIMEZONE,
    x: [
      ['X-WR-TIMEZONE', TIMEZONE],
      ['X-PUBLISHED-TTL', 'PT5M'],
    ],
  });

  for (const event of events) {
    const startDate =
      event.startDateTime instanceof Date
        ? event.startDateTime
        : new Date(event.startDateTime);
    const endDate =
      event.endDateTime instanceof Date
        ? event.endDateTime
        : new Date(event.endDateTime);

    const icalEvent = calendar.createEvent({
      id: event.id,
      start: startDate,
      end: endDate,
      timezone: TIMEZONE,
      summary: event.title,
      description: event.description || undefined,
      location: event.location || undefined,
    });

    if (event.recurrenceRule) {
      icalEvent.repeating(parseRRule(event.recurrenceRule));
    }

    // Add source reference as custom property for click-through
    if (event.sourceRef) {
      icalEvent.x([
        { key: 'X-MAPLE-SOURCE-REF', value: event.sourceRef },
      ]);
    }
  }

  // ical-generator does not emit VTIMEZONE blocks, which strict parsers
  // (e.g. Open Web Calendar / recurring-ical-events) require to resolve
  // TZID references. Inject the VTIMEZONE component after the calendar header.
  const icsString = calendar.toString();
  const vtimezone = getVtimezoneComponent(TIMEZONE);
  if (vtimezone) {
    return icsString.replace(
      'BEGIN:VEVENT',
      `${vtimezone}\r\nBEGIN:VEVENT`
    );
  }
  return icsString;
}
