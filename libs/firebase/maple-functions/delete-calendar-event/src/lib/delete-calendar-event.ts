/**
 * Delete Calendar Event Cloud Function
 *
 * Deletes an existing calendar event.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { CalendarEventRepository } from '@maple/firebase/database';
import type {
  DeleteCalendarEventRequest,
  DeleteCalendarEventResponse,
} from '@maple/ts/firebase/api-types';

export const deleteCalendarEvent = createAdminFunction<
  DeleteCalendarEventRequest,
  DeleteCalendarEventResponse
>(async (data) => {
  // Check if event exists
  const existing = await CalendarEventRepository.findById(data.id);
  if (!existing) {
    throw new Error(`Calendar event not found: ${data.id}`);
  }

  await CalendarEventRepository.delete(data.id);

  return { success: true };
});
