/**
 * Create Calendar Event Cloud Function
 *
 * Creates a new calendar event.
 * Deployed to us-east4 via CI/CD pipeline.
 */
import {
  createRoleFunction,
  Role,
  hasAnyRole,
  throwPermissionDenied,
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
>(async (data, context) => {
  // Lesson teachers do NOT manage calendar events — their lessons are derived,
  // not hand-authored — but they CAN book a room. So a caller who is ONLY a
  // lesson teacher (not admin / MT / clerk) may only create a room booking
  // (an event that claims a room). Everyone else may create any event.
  const uid = context.uid;
  const canCreateAnyEvent =
    !!uid &&
    (await hasAnyRole(uid, [Role.Admin, Role.MtTeacher, Role.Clerk]));
  if (!canCreateAnyEvent && !data.room) {
    throwPermissionDenied('Lesson teachers can only book a room.');
  }

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
