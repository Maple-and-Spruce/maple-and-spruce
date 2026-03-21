/**
 * Update Calendar Event Cloud Function
 *
 * Updates an existing calendar event.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { CalendarEventRepository } from '@maple/firebase/database';
import { calendarEventValidation } from '@maple/ts/validation';
import type {
  UpdateCalendarEventRequest,
  UpdateCalendarEventResponse,
} from '@maple/ts/firebase/api-types';

export const updateCalendarEvent = createAdminFunction<
  UpdateCalendarEventRequest,
  UpdateCalendarEventResponse
>(async (data) => {
  // Check if event exists
  const existing = await CalendarEventRepository.findById(data.id);
  if (!existing) {
    throw new Error(`Calendar event not found: ${data.id}`);
  }

  // Validate the merged data
  const merged = { ...existing, ...data };
  const result = calendarEventValidation(merged);
  if (!result.isValid()) {
    const errors = result.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const calendarEvent = await CalendarEventRepository.update(data);

  return { calendarEvent };
});
