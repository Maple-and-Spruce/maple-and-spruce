/**
 * Calendar Event validation suite
 *
 * Vest validation for calendar event forms.
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { CreateCalendarEventInput } from '@maple/ts/domain';
import { CALENDAR_EVENT_TYPES, ROOMS } from '@maple/ts/domain';

/**
 * Validate calendar event form data
 *
 * @param data - Partial calendar event data to validate
 * @param field - Optional field to validate (for single-field validation)
 */
export const calendarEventValidation = staticSuite(
  (data: Partial<CreateCalendarEventInput>, field?: string | string[]) => {
    only(field);

    // Title validation
    test('title', 'Title is required', () => {
      enforce(data.title).isNotBlank();
    });

    test('title', 'Title must be at least 3 characters', () => {
      enforce(data.title).longerThanOrEquals(3);
    });

    test('title', 'Title must be less than 200 characters', () => {
      enforce(data.title).shorterThan(200);
    });

    // Description validation (optional but if provided, validate length)
    test('description', 'Description must be less than 2000 characters', () => {
      if (data.description) {
        enforce(data.description).shorterThanOrEquals(2000);
      }
    });

    // Start date/time validation
    test('startDateTime', 'Start date and time is required', () => {
      enforce(data.startDateTime).isNotNullish();
    });

    // End date/time validation
    test('endDateTime', 'End date and time is required', () => {
      enforce(data.endDateTime).isNotNullish();
    });

    test('endDateTime', 'End time must be after start time', () => {
      if (data.startDateTime && data.endDateTime) {
        const start =
          data.startDateTime instanceof Date
            ? data.startDateTime
            : new Date(data.startDateTime);
        const end =
          data.endDateTime instanceof Date
            ? data.endDateTime
            : new Date(data.endDateTime);
        enforce(end.getTime()).greaterThan(start.getTime());
      }
    });

    // Type validation
    test('type', 'Event type is required', () => {
      enforce(data.type).isNotBlank();
    });

    test('type', 'Event type must be valid', () => {
      if (data.type) {
        enforce(data.type).inside(CALENDAR_EVENT_TYPES);
      }
    });

    // Recurrence rule validation (optional but if provided, must be non-empty)
    test('recurrenceRule', 'Recurrence rule must not be empty if provided', () => {
      if (data.recurrenceRule !== undefined && data.recurrenceRule !== null) {
        enforce(data.recurrenceRule).isNotBlank();
      }
    });

    // Room validation (optional, but must be a known room when set)
    test('room', 'Room must be valid', () => {
      if (data.room !== undefined && data.room !== null) {
        enforce(data.room).inside(ROOMS);
      }
    });

    // Location validation (optional but limit length)
    test('location', 'Location must be less than 500 characters', () => {
      if (data.location) {
        enforce(data.location).shorterThanOrEquals(500);
      }
    });
  }
);
