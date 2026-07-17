/**
 * Create Calendar Event Cloud Function
 *
 * Creates a new calendar event.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
} from '@maple/firebase/functions';
import { CalendarEventRepository } from '@maple/firebase/database';
import { calendarEventValidation } from '@maple/ts/validation';
import type {
  CreateCalendarEventRequest,
  CreateCalendarEventResponse,
} from '@maple/ts/firebase/api-types';

export const createCalendarEvent = createRoleFunction<
  CreateCalendarEventRequest,
  CreateCalendarEventResponse
>(async (data) => {
  // Validate input
  const result = calendarEventValidation(data);
  if (!result.isValid()) {
    const errors = result.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const calendarEvent = await CalendarEventRepository.create(data);

  return { calendarEvent };
}, [Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher]);
