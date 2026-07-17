/**
 * Get Calendar Event Cloud Function
 *
 * Retrieves a single calendar event by ID.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { CalendarEventRepository } from '@maple/firebase/database';
import type {
  GetCalendarEventRequest,
  GetCalendarEventResponse,
} from '@maple/ts/firebase/api-types';

export const getCalendarEvent = createRoleFunction<
  GetCalendarEventRequest,
  GetCalendarEventResponse
>(async (data) => {
  const calendarEvent = await CalendarEventRepository.findById(data.id);

  if (!calendarEvent) {
    throw new Error(`Calendar event not found: ${data.id}`);
  }

  return { calendarEvent };
}, [Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher]);
