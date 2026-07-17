/**
 * Get Calendar Events Cloud Function
 *
 * Retrieves all calendar events with optional filters.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { CalendarEventRepository } from '@maple/firebase/database';
import type {
  GetCalendarEventsRequest,
  GetCalendarEventsResponse,
} from '@maple/ts/firebase/api-types';

export const getCalendarEvents = createRoleFunction<
  GetCalendarEventsRequest,
  GetCalendarEventsResponse
>(async (data) => {
  const calendarEvents = await CalendarEventRepository.findAll({
    type: data.type,
    publicOnly: data.publicOnly,
  });

  return { calendarEvents };
}, [Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher]);
