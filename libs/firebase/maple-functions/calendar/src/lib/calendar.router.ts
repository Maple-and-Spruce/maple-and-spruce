/**
 * calendar — the staff side of the calendar, as one Cloud Function in
 * `maple-core` (ADR-029, #73): calendar events, the room schedule, and the
 * embed configuration.
 *
 * Every route keeps the gate it had as its own function. Reads and creating an
 * event are open to every staff role, and a lesson teacher may only book a room;
 * editing and deleting events exclude lesson teachers; the embed configuration
 * is admin-only.
 *
 * Deliberately not here: the public calendar URLs. `calendarEmbed` and the nine
 * `.ics` feeds are raw HTTP handlers behind `/calendar/*` Hosting rewrites that
 * families, Google Calendar and Webflow are subscribed to. A route speaks the
 * callable envelope, and those URLs must never change.
 *
 * Each route spells its gate out in full: `tools/check-callable-roles.ts` reads
 * `requiringRole` off the AST and cannot see through a helper.
 */
import { Functions, Role } from '@maple/firebase/functions';
import type {
  AddCalendarEmbedSourceRequest,
  AddCalendarEmbedSourceResponse,
  CreateCalendarEventRequest,
  CreateCalendarEventResponse,
  DeleteCalendarEventRequest,
  DeleteCalendarEventResponse,
  GetCalendarEmbedConfigRequest,
  GetCalendarEmbedConfigResponse,
  GetCalendarEventRequest,
  GetCalendarEventResponse,
  GetCalendarEventsRequest,
  GetCalendarEventsResponse,
  GetRoomScheduleRequest,
  GetRoomScheduleResponse,
  RemoveCalendarEmbedSourceRequest,
  RemoveCalendarEmbedSourceResponse,
  UpdateCalendarEmbedConfigRequest,
  UpdateCalendarEmbedConfigResponse,
  UpdateCalendarEventRequest,
  UpdateCalendarEventResponse,
} from '@maple/ts/firebase/api-types';
import { getCalendarEvents } from './get-calendar-events';
import { getCalendarEvent } from './get-calendar-event';
import { createCalendarEvent } from './create-calendar-event';
import { updateCalendarEvent } from './update-calendar-event';
import { deleteCalendarEvent } from './delete-calendar-event';
import { getRoomSchedule } from './get-room-schedule';
import { getCalendarEmbedConfig } from './get-calendar-embed-config';
import { updateCalendarEmbedConfig } from './update-calendar-embed-config';
import { addCalendarEmbedSource } from './add-calendar-embed-source';
import { removeCalendarEmbedSource } from './remove-calendar-embed-source';

export const calendar = Functions.router('calendar', {
  // Calendar events
  getCalendarEvents: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher])
    .asRoute<GetCalendarEventsRequest, GetCalendarEventsResponse>(
      getCalendarEvents,
    ),

  getCalendarEvent: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher])
    .asRoute<GetCalendarEventRequest, GetCalendarEventResponse>(
      getCalendarEvent,
    ),

  createCalendarEvent: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher])
    .asRoute<CreateCalendarEventRequest, CreateCalendarEventResponse>(
      createCalendarEvent,
    ),

  updateCalendarEvent: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher, Role.Clerk])
    .asRoute<UpdateCalendarEventRequest, UpdateCalendarEventResponse>(
      updateCalendarEvent,
    ),

  deleteCalendarEvent: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher, Role.Clerk])
    .asRoute<DeleteCalendarEventRequest, DeleteCalendarEventResponse>(
      deleteCalendarEvent,
    ),

  // Room schedule (the dashboard room card and every booking form)
  getRoomSchedule: Functions.endpoint
    .requiringRole([Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher])
    .asRoute<GetRoomScheduleRequest, GetRoomScheduleResponse>(getRoomSchedule),

  // Calendar embed configuration (the sources behind /calendar/embed)
  getCalendarEmbedConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetCalendarEmbedConfigRequest, GetCalendarEmbedConfigResponse>(
      getCalendarEmbedConfig,
    ),

  updateCalendarEmbedConfig: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<
      UpdateCalendarEmbedConfigRequest,
      UpdateCalendarEmbedConfigResponse
    >(updateCalendarEmbedConfig),

  addCalendarEmbedSource: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<AddCalendarEmbedSourceRequest, AddCalendarEmbedSourceResponse>(
      addCalendarEmbedSource,
    ),

  removeCalendarEmbedSource: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<
      RemoveCalendarEmbedSourceRequest,
      RemoveCalendarEmbedSourceResponse
    >(removeCalendarEmbedSource),
});
