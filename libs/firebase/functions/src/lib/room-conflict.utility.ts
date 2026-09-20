/**
 * Refuse to put two things in the room at once (legacy #841).
 *
 * Reads `CalendarEvent`, which is the room-occupancy model: `onLessonWrite`
 * upserts one per scheduled/rendered/no-show lesson, the room-booking page
 * creates them for rentals and Music Together, and a cancelled lesson has its
 * event removed. Checking lessons instead would miss the rentals entirely.
 *
 * Call BEFORE the write. A lesson with no room cannot clash — the room is
 * optional for backwards compatibility, and a lesson that claims no room
 * occupies none.
 */
import { CalendarEventRepository } from '@maple/firebase/database';
import { findRoomConflicts, describeRoomConflict } from '@maple/ts/domain';
import type { Room, RoomConflict } from '@maple/ts/domain';
import { throwFailedPrecondition } from './errors.utility';

export interface RoomWindow {
  room?: Room | null;
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
  if (!window.room) return [];
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
