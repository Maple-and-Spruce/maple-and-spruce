/**
 * Two things cannot be in the room at once (#841).
 *
 * Nothing enforced this. Lessons, Music Together classes and private rentals
 * could all be booked into the same hour and the model would not object. The
 * one guard that existed is not this one — the materialiser's `occupied` set is
 * keyed `studentId|instant`, so it stops a student clashing with *themselves*
 * and is blind to two different people wanting the same room.
 *
 * The room is the real physical constraint. Katie's stated reason for tracking
 * overridden lesson times at all is making sure the Spruce Room is free.
 *
 * WHY THIS READS CALENDAR EVENTS RATHER THAN LESSONS
 * --------------------------------------------------
 * `CalendarEvent` is already the room-occupancy model: `onLessonWrite` upserts
 * one per scheduled/rendered/no-show lesson, the room-booking page creates them
 * for rentals and Music Together, and a cancelled or deleted lesson has its
 * event removed. So checking events covers every way the room gets used, where
 * checking lessons would miss the rentals entirely.
 */
import type { CalendarEvent } from './calendar-event';
import type { Room } from './room';
import { getRoomLabel } from './room';

/** Something already in the room during the window asked for. */
export interface RoomConflict {
  event: Pick<
    CalendarEvent,
    'id' | 'title' | 'startDateTime' | 'endDateTime' | 'sourceRef'
  >;
  room: Room;
}

export interface RoomBookingWindow {
  room: Room;
  startsAt: Date;
  durationMinutes: number;
  /**
   * The booking's own calendar event, as `lessons/{id}`. Excluded, so editing
   * a lesson does not report it clashing with itself.
   */
  excludeSourceRef?: string;
}

/** Half-open overlap: touching end-to-start is not a clash. */
export function intervalsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/**
 * Which of these events stand in the way of the requested window.
 *
 * `events` is whatever the caller fetched for the room and day; this decides
 * which of them actually collide. Pure, so the rule can be tested without
 * Firestore and shown in the UI before anything is written.
 */
export function findRoomConflicts(
  window: RoomBookingWindow,
  events: Pick<
    CalendarEvent,
    'id' | 'title' | 'startDateTime' | 'endDateTime' | 'sourceRef' | 'room'
  >[]
): RoomConflict[] {
  const start = window.startsAt;
  const end = new Date(start.getTime() + window.durationMinutes * 60_000);

  return events
    .filter((e) => e.room === window.room)
    // The booking's own event, when it already exists — an edit must not
    // report the thing being edited as the obstacle.
    .filter(
      (e) => !window.excludeSourceRef || e.sourceRef !== window.excludeSourceRef
    )
    .filter((e) =>
      intervalsOverlap(start, end, e.startDateTime, e.endDateTime)
    )
    .map((e) => ({ event: e, room: window.room }));
}

/** How a clash reads to the person who caused it. */
export function describeRoomConflict(
  conflict: RoomConflict,
  timeZone = 'America/New_York'
): string {
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const from = time.format(conflict.event.startDateTime);
  const to = time.format(conflict.event.endDateTime);
  return `${getRoomLabel(conflict.room)} is already taken ${from}–${to} by ${conflict.event.title}`;
}
