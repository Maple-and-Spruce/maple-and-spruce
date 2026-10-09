/**
 * Get Calendar Events Cloud Function
 *
 * Retrieves all calendar events with optional filters.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { CalendarEventRepository } from '@maple/firebase/database';
import type {
  GetCalendarEventsRequest,
  GetCalendarEventsResponse,
} from '@maple/ts/firebase/api-types';

export async function getCalendarEvents(
  data: GetCalendarEventsRequest,
): Promise<GetCalendarEventsResponse> {
  const calendarEvents = await CalendarEventRepository.findAll({
    type: data.type,
    publicOnly: data.publicOnly,
  });

  return { calendarEvents };
}
