/**
 * Refuse to put two things in the room at once (legacy #841).
 *
 * Reads `CalendarEvent`, which is the room-occupancy model: `onLessonWrite`
 * upserts one per scheduled/rendered/no-show lesson, the room-booking page
 * creates them for rentals and Music Together, and a cancelled lesson has its
 * event removed. Checking lessons instead would miss the rentals entirely.
 *
 * Call BEFORE the write. The room is required here on purpose: a lesson that
 * names no room is still mirrored into Spruce by `onLessonWrite`, so a caller
 * that passed "no room" would skip the check for a slot the calendar then
 * shows as taken. Resolve it with `lessonRoom()` first.
 */
import { CalendarEventRepository } from '@maple/firebase/database';
import { findRoomConflicts, describeRoomConflict } from '@maple/ts/domain';
import type { Room, RoomConflict } from '@maple/ts/domain';
import { throwFailedPrecondition } from './errors.utility';

export interface RoomWindow {
  room: Room;
  scheduledAt: Date;
  durationMinutes: number;
  /** `lessons/{id}` — the booking's own event, so an edit does not clash with itself. */
  excludeSourceRef?: string;
}

/**
 * What is already in the room during this window.
 *
 * Returns rather than throws, so the unattended paths (materialisation) can
 * skip an occurrence and carry on while the interactive paths refuse.
 */
export async function findConflictsForWindow(
  window: RoomWindow
): Promise<RoomConflict[]> {
  if (Number.isNaN(window.scheduledAt.getTime())) return [];

  const end = new Date(
    window.scheduledAt.getTime() + window.durationMinutes * 60_000
  );

  const events = await CalendarEventRepository.findByRoomInRange(
    window.room,
    window.scheduledAt,
    end
  );

  return findRoomConflicts(
    {
      room: window.room,
      startsAt: window.scheduledAt,
      durationMinutes: window.durationMinutes,
      excludeSourceRef: window.excludeSourceRef,
    },
    events
  );
}

/**
 * Refuse the write when the room is taken.
 *
 * `failed-precondition` rather than `invalid-argument`: the request is
 * well-formed, the world just is not in a state that allows it — and a client
 * can tell the two apart.
 */
export async function assertRoomIsFree(windows: RoomWindow[]): Promise<void> {
  for (const window of windows) {
    const conflicts = await findConflictsForWindow(window);
    if (conflicts.length > 0) {
      throwFailedPrecondition(describeRoomConflict(conflicts[0]));
    }
  }
}
