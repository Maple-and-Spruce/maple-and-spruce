/**
 * Two things cannot be in the room at once (#841).
 *
 * The room is the real physical constraint — Katie tracks overridden lesson
 * times specifically to keep the Spruce Room free — and nothing enforced it.
 * These fix the edges, because an off-by-one here either double-books a room
 * or refuses a booking that was fine.
 */
import { describe, it, expect } from 'vitest';
import {
  describeRoomConflict,
  findRoomConflicts,
  intervalsOverlap,
} from './room-conflict';
import type { CalendarEvent } from './calendar-event';

const AT = (h: number, m = 0) => new Date(Date.UTC(2026, 8, 15, h + 4, m));

let seq = 0;
function event(
  startHour: number,
  endHour: number,
  over: Partial<CalendarEvent> = {}
) {
  seq++;
  return {
    id: `evt-${seq}`,
    title: 'Music Lesson',
    startDateTime: AT(startHour),
    endDateTime: AT(endHour),
    sourceRef: `lessons/l${seq}`,
    room: 'spruce' as const,
    ...over,
  } as CalendarEvent;
}

const window = (startHour: number, durationMinutes: number, over = {}) => ({
  room: 'spruce' as const,
  startsAt: AT(startHour),
  durationMinutes,
  ...over,
});

describe('overlap', () => {
  it('is a clash when one starts inside the other', () => {
    expect(intervalsOverlap(AT(10), AT(11), AT(10, 30), AT(11, 30))).toBe(true);
  });

  it('is NOT a clash when one ends exactly as the other starts', () => {
    // Back-to-back lessons are the normal case — an inclusive comparison here
    // would refuse every consecutive booking in the day.
    expect(intervalsOverlap(AT(10), AT(11), AT(11), AT(12))).toBe(false);
  });

  it('is a clash when one wholly contains the other', () => {
    expect(intervalsOverlap(AT(9), AT(13), AT(10), AT(11))).toBe(true);
  });
});

describe('finding what is in the way', () => {
  it('reports a lesson overlapping the requested window', () => {
    const conflicts = findRoomConflicts(window(10, 60), [event(10, 11)]);
    expect(conflicts).toHaveLength(1);
  });

  it('allows a booking that starts exactly when the last one ends', () => {
    expect(findRoomConflicts(window(11, 60), [event(10, 11)])).toEqual([]);
  });

  it('catches a clash with a room booking, not just another lesson', () => {
    // The reason this reads calendar events: rentals and Music Together
    // classes occupy the room too, and checking lessons would miss them.
    const rental = event(10, 12, {
      title: 'Private rental',
      sourceRef: null,
    });

    expect(findRoomConflicts(window(10, 30), [rental])).toHaveLength(1);
  });

  it('ignores an event in a different room', () => {
    const elsewhere = event(10, 11, { room: 'maple' as never });
    expect(findRoomConflicts(window(10, 60), [elsewhere])).toEqual([]);
  });

  it('ignores an event with no room — it claims nothing', () => {
    // Store hours and off-site classes are on the calendar but occupy no room.
    const offSite = event(10, 11, { room: null });
    expect(findRoomConflicts(window(10, 60), [offSite])).toEqual([]);
  });

  it('does not report a lesson clashing with ITSELF when edited', () => {
    // The lesson's own event already exists; without this every reschedule
    // would be refused by the thing being rescheduled.
    const own = event(10, 11, { sourceRef: 'lessons/abc' });

    expect(
      findRoomConflicts(
        window(10, 60, { excludeSourceRef: 'lessons/abc' }),
        [own]
      )
    ).toEqual([]);
  });

  it('still reports a DIFFERENT lesson while one is excluded', () => {
    const own = event(10, 11, { sourceRef: 'lessons/abc' });
    const other = event(10, 11, { sourceRef: 'lessons/xyz', title: 'Music Lesson' });

    const conflicts = findRoomConflicts(
      window(10, 60, { excludeSourceRef: 'lessons/abc' }),
      [own, other]
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].event.sourceRef).toBe('lessons/xyz');
  });

  it('reports every clash, not just the first', () => {
    const conflicts = findRoomConflicts(window(10, 120), [
      event(10, 11),
      event(11, 12),
    ]);
    expect(conflicts).toHaveLength(2);
  });

  it('finds nothing in an empty room', () => {
    expect(findRoomConflicts(window(10, 60), [])).toEqual([]);
  });
});

describe('how a clash reads', () => {
  it('names the room, the time and what is already there', () => {
    const [conflict] = findRoomConflicts(window(10, 60), [
      event(10, 11, { title: 'Music Together' }),
    ]);

    expect(describeRoomConflict(conflict)).toBe(
      'Spruce Room is already taken 10:00 AM–11:00 AM by Music Together'
    );
  });
});
