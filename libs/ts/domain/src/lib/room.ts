/**
 * Room domain types
 *
 * Rooms are bookable spaces at the shop whose occupancy is tracked through
 * CalendarEvents (`CalendarEvent.room`). Modeled as a string union rather
 * than a managed entity — there is one contested room today (Spruce) and
 * adding another is a one-line change.
 */
import type { CalendarEventType } from './calendar-event';

export type Room = 'spruce';

/**
 * All valid rooms for validation
 */
export const ROOMS: Room[] = ['spruce'];

/**
 * Human-readable label for a room
 */
export function getRoomLabel(room: Room): string {
  const labels: Record<Room, string> = {
    spruce: 'Spruce Room',
  };
  return labels[room];
}

/**
 * A contiguous block of time during which a room is occupied by one
 * calendar event. Returned by the getRoomSchedule API and consumed by
 * status displays, day strips, and conflict checks.
 */
export interface RoomBusyWindow {
  /** ID of the CalendarEvent backing this window */
  eventId: string;
  title: string;
  type: CalendarEventType;
  /** Originating doc (e.g. "lessons/abc123"), null for ad-hoc events */
  sourceRef: string | null;
  start: Date;
  end: Date;
}

/**
 * Point-in-time occupancy status for a room.
 *
 * - `free`: the room is open right now. `until` is the start of the next
 *   busy window (null when nothing else is scheduled in the queried range).
 * - `in-use`: the room is occupied. `freeAt` is when the room actually
 *   opens up — back-to-back and overlapping windows are coalesced, so a
 *   4:00–4:30 lesson followed by a 4:30–5:00 lesson reports `freeAt` 5:00.
 */
export type RoomStatus =
  | { kind: 'free'; until: Date | null; next: RoomBusyWindow | null }
  | { kind: 'in-use'; current: RoomBusyWindow; freeAt: Date; next: RoomBusyWindow | null };

/**
 * Compute a room's occupancy status at a moment in time from its busy
 * windows. Windows may be unsorted and may overlap.
 */
export function getRoomStatus(
  windows: RoomBusyWindow[],
  now: Date
): RoomStatus {
  const sorted = [...windows].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const current = sorted.find(
    (w) => w.start.getTime() <= now.getTime() && now.getTime() < w.end.getTime()
  );

  if (!current) {
    const next = sorted.find((w) => w.start.getTime() > now.getTime()) ?? null;
    return { kind: 'free', until: next?.start ?? null, next };
  }

  // Coalesce the contiguous run of windows: while the next window starts at
  // or before the current run ends, the room never actually frees up.
  let freeAt = current.end;
  for (const w of sorted) {
    if (w.start.getTime() <= freeAt.getTime() && w.end.getTime() > freeAt.getTime()) {
      freeAt = w.end;
    }
  }

  const next =
    sorted.find((w) => w.start.getTime() > freeAt.getTime()) ?? null;

  return { kind: 'in-use', current, freeAt, next };
}
