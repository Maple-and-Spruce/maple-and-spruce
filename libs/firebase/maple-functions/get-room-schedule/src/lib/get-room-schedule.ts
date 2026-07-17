/**
 * Get Room Schedule Cloud Function
 *
 * Returns the busy windows for a room over a time range — every calendar
 * event (lesson-derived, class-derived, or ad hoc) that claims the room and
 * overlaps the range. Powers the "Spruce right now" dashboard widget,
 * scheduling-dialog day strips, and booking conflict warnings.
 *
 * Admin-only: lesson-derived windows exist for private events, so this must
 * not be publicly callable.
 */
import {
  createRoleFunction,
  throwInvalidArgument,
  Role,
} from '@maple/firebase/functions';
import { CalendarEventRepository } from '@maple/firebase/database';
import { ROOMS } from '@maple/ts/domain';
import type {
  GetRoomScheduleRequest,
  GetRoomScheduleResponse,
} from '@maple/ts/firebase/api-types';

export const getRoomSchedule = createRoleFunction<
  GetRoomScheduleRequest,
  GetRoomScheduleResponse
>(async (data) => {
  if (!data.room || !ROOMS.includes(data.room)) {
    throwInvalidArgument('A valid room is required');
  }

  const start = data.start ? new Date(data.start) : undefined;
  const end = data.end ? new Date(data.end) : undefined;
  if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) {
    throwInvalidArgument('start and end must be valid ISO date strings');
  }
  if (end.getTime() <= start.getTime()) {
    throwInvalidArgument('end must be after start');
  }

  const events = await CalendarEventRepository.findByRoomInRange(
    data.room,
    start,
    end
  );

  return {
    windows: events.map((e) => ({
      eventId: e.id,
      title: e.title,
      type: e.type,
      sourceRef: e.sourceRef,
      start: e.startDateTime.toISOString(),
      end: e.endDateTime.toISOString(),
    })),
  };
}, [Role.Admin, Role.MtTeacher, Role.Clerk, Role.LessonTeacher]);
