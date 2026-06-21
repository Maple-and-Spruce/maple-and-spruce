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

/** A proposed time range to check against a room's existing bookings. */
export interface TimeRange {
  start: Date;
  end: Date;
}

/**
 * Return the busy windows that overlap a proposed time range — i.e. the
 * room is already taken during part of it. Powers the warn-and-confirm
 * conflict notices in the scheduling flows.
 *
 * Overlap is half-open: a proposed slot that starts exactly when a window
 * ends (or ends exactly when one starts) does NOT conflict — back-to-back
 * bookings share a boundary but not a moment. A zero-length proposed range
 * never conflicts.
 *
 * Edit flows can exclude an item's own derived windows so it doesn't flag
 * a conflict against itself:
 * - `ignoreEventId` skips one event by id (e.g. an ad-hoc booking).
 * - `ignoreSourceRef` skips every window from one source (e.g. all the
 *   session events a class derives, `sourceRef: "classes/{id}"`).
 */
export function getRoomConflicts(
  proposed: TimeRange,
  windows: RoomBusyWindow[],
  options?: { ignoreEventId?: string; ignoreSourceRef?: string }
): RoomBusyWindow[] {
  const startMs = proposed.start.getTime();
  const endMs = proposed.end.getTime();
  return windows.filter(
    (w) =>
      w.eventId !== options?.ignoreEventId &&
      (options?.ignoreSourceRef == null ||
        w.sourceRef !== options.ignoreSourceRef) &&
      startMs < w.end.getTime() &&
      w.start.getTime() < endMs
  );
}

/**
 * One band in a room's day view: either `open` (available) or `busy`
 * (occupied by one or more coalesced bookings). Segments are contiguous,
 * non-overlapping, and together cover exactly [dayStart, dayEnd].
 */
export type RoomDaySegment =
  | { kind: 'open'; start: Date; end: Date }
  | { kind: 'busy'; start: Date; end: Date; windows: RoomBusyWindow[] };

/**
 * Build the day strip for a room: the open/busy bands across a day, e.g.
 * "Open 9:00–4:30 · Music Together 4:30–6:00 · Open after 6:00". Windows
 * are clipped to [dayStart, dayEnd]; overlapping and back-to-back windows
 * are merged into a single busy band that carries all its source windows.
 */
export function getDayStrip(
  windows: RoomBusyWindow[],
  dayStart: Date,
  dayEnd: Date
): RoomDaySegment[] {
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayEnd.getTime();

  // Clip to the day and drop anything fully outside it.
  const clipped = windows
    .map((w) => ({
      window: w,
      start: Math.max(w.start.getTime(), dayStartMs),
      end: Math.min(w.end.getTime(), dayEndMs),
    }))
    .filter((c) => c.start < c.end)
    .sort((a, b) => a.start - b.start);

  // Merge overlapping/adjacent clipped windows into busy runs.
  const runs: { start: number; end: number; windows: RoomBusyWindow[] }[] = [];
  for (const c of clipped) {
    const last = runs[runs.length - 1];
    if (last && c.start <= last.end) {
      last.end = Math.max(last.end, c.end);
      last.windows.push(c.window);
    } else {
      runs.push({ start: c.start, end: c.end, windows: [c.window] });
    }
  }

  // Walk the day, filling gaps with open segments.
  const segments: RoomDaySegment[] = [];
  let cursor = dayStartMs;
  for (const run of runs) {
    if (run.start > cursor) {
      segments.push({
        kind: 'open',
        start: new Date(cursor),
        end: new Date(run.start),
      });
    }
    segments.push({
      kind: 'busy',
      start: new Date(run.start),
      end: new Date(run.end),
      windows: run.windows,
    });
    cursor = run.end;
  }
  if (cursor < dayEndMs) {
    segments.push({
      kind: 'open',
      start: new Date(cursor),
      end: new Date(dayEndMs),
    });
  }

  return segments;
}
