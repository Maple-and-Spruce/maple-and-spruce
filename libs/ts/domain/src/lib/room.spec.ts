import { describe, it, expect } from 'vitest';
import {
  getRoomStatus,
  getRoomLabel,
  getRoomConflicts,
  getDayStrip,
  type RoomBusyWindow,
} from './room';

function win(
  startIso: string,
  endIso: string,
  overrides?: Partial<RoomBusyWindow>
): RoomBusyWindow {
  return {
    eventId: `evt-${startIso}`,
    title: 'Music Lesson',
    type: 'lesson',
    sourceRef: null,
    start: new Date(startIso),
    end: new Date(endIso),
    ...overrides,
  };
}

describe('getRoomLabel', () => {
  it('labels the spruce room', () => {
    expect(getRoomLabel('spruce')).toBe('Spruce Room');
  });
});

describe('getRoomStatus', () => {
  const now = new Date('2026-06-11T15:00:00Z');

  it('reports free with no windows at all', () => {
    const status = getRoomStatus([], now);
    expect(status).toEqual({ kind: 'free', until: null, next: null });
  });

  it('reports free with the next upcoming window', () => {
    const next = win('2026-06-11T16:30:00Z', '2026-06-11T18:00:00Z', {
      title: 'Music Together',
    });
    const status = getRoomStatus([next], now);
    expect(status.kind).toBe('free');
    if (status.kind === 'free') {
      expect(status.until).toEqual(new Date('2026-06-11T16:30:00Z'));
      expect(status.next?.title).toBe('Music Together');
    }
  });

  it('ignores windows already in the past when free', () => {
    const past = win('2026-06-11T10:00:00Z', '2026-06-11T11:00:00Z');
    const status = getRoomStatus([past], now);
    expect(status).toEqual({ kind: 'free', until: null, next: null });
  });

  it('reports in-use during a window', () => {
    const current = win('2026-06-11T14:30:00Z', '2026-06-11T15:30:00Z');
    const status = getRoomStatus([current], now);
    expect(status.kind).toBe('in-use');
    if (status.kind === 'in-use') {
      expect(status.current.eventId).toBe(current.eventId);
      expect(status.freeAt).toEqual(new Date('2026-06-11T15:30:00Z'));
      expect(status.next).toBeNull();
    }
  });

  it('treats a window ending exactly now as over', () => {
    const ending = win('2026-06-11T14:00:00Z', '2026-06-11T15:00:00Z');
    const status = getRoomStatus([ending], now);
    expect(status.kind).toBe('free');
  });

  it('treats a window starting exactly now as current', () => {
    const starting = win('2026-06-11T15:00:00Z', '2026-06-11T16:00:00Z');
    const status = getRoomStatus([starting], now);
    expect(status.kind).toBe('in-use');
  });

  it('coalesces back-to-back windows into one occupied run', () => {
    const a = win('2026-06-11T14:30:00Z', '2026-06-11T15:30:00Z');
    const b = win('2026-06-11T15:30:00Z', '2026-06-11T16:00:00Z');
    const c = win('2026-06-11T16:00:00Z', '2026-06-11T16:45:00Z');
    const status = getRoomStatus([c, a, b], now); // unsorted on purpose
    expect(status.kind).toBe('in-use');
    if (status.kind === 'in-use') {
      expect(status.current.eventId).toBe(a.eventId);
      expect(status.freeAt).toEqual(new Date('2026-06-11T16:45:00Z'));
    }
  });

  it('coalesces overlapping windows', () => {
    const a = win('2026-06-11T14:00:00Z', '2026-06-11T15:30:00Z');
    const b = win('2026-06-11T15:00:00Z', '2026-06-11T17:00:00Z');
    const status = getRoomStatus([a, b], now);
    expect(status.kind).toBe('in-use');
    if (status.kind === 'in-use') {
      expect(status.freeAt).toEqual(new Date('2026-06-11T17:00:00Z'));
    }
  });

  it('reports the next window after a coalesced run, not within it', () => {
    const a = win('2026-06-11T14:30:00Z', '2026-06-11T15:30:00Z');
    const b = win('2026-06-11T15:30:00Z', '2026-06-11T16:00:00Z');
    const later = win('2026-06-11T18:00:00Z', '2026-06-11T19:00:00Z', {
      title: 'Band Practice',
    });
    const status = getRoomStatus([a, b, later], now);
    expect(status.kind).toBe('in-use');
    if (status.kind === 'in-use') {
      expect(status.freeAt).toEqual(new Date('2026-06-11T16:00:00Z'));
      expect(status.next?.title).toBe('Band Practice');
    }
  });
});

describe('getRoomConflicts', () => {
  const booked = win('2026-06-11T16:30:00Z', '2026-06-11T18:00:00Z', {
    eventId: 'evt-mt',
    title: 'Music Together',
  });

  it('returns no conflicts when the room is empty', () => {
    expect(
      getRoomConflicts(
        { start: new Date('2026-06-11T16:30:00Z'), end: new Date('2026-06-11T17:00:00Z') },
        []
      )
    ).toEqual([]);
  });

  it('flags a proposed slot that overlaps a booking', () => {
    const conflicts = getRoomConflicts(
      { start: new Date('2026-06-11T17:00:00Z'), end: new Date('2026-06-11T17:30:00Z') },
      [booked]
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].title).toBe('Music Together');
  });

  it('does not flag a back-to-back slot ending exactly when a booking starts', () => {
    const conflicts = getRoomConflicts(
      { start: new Date('2026-06-11T16:00:00Z'), end: new Date('2026-06-11T16:30:00Z') },
      [booked]
    );
    expect(conflicts).toEqual([]);
  });

  it('does not flag a back-to-back slot starting exactly when a booking ends', () => {
    const conflicts = getRoomConflicts(
      { start: new Date('2026-06-11T18:00:00Z'), end: new Date('2026-06-11T18:30:00Z') },
      [booked]
    );
    expect(conflicts).toEqual([]);
  });

  it('flags a proposed slot fully containing a booking', () => {
    const conflicts = getRoomConflicts(
      { start: new Date('2026-06-11T16:00:00Z'), end: new Date('2026-06-11T19:00:00Z') },
      [booked]
    );
    expect(conflicts).toHaveLength(1);
  });

  it('ignores the event named in ignoreEventId (edit flow)', () => {
    const conflicts = getRoomConflicts(
      { start: new Date('2026-06-11T17:00:00Z'), end: new Date('2026-06-11T17:30:00Z') },
      [booked],
      { ignoreEventId: 'evt-mt' }
    );
    expect(conflicts).toEqual([]);
  });

  it('returns multiple overlapping bookings', () => {
    const second = win('2026-06-11T17:00:00Z', '2026-06-11T17:45:00Z', {
      eventId: 'evt-lesson',
      title: 'Music Lesson',
    });
    const conflicts = getRoomConflicts(
      { start: new Date('2026-06-11T16:45:00Z'), end: new Date('2026-06-11T17:15:00Z') },
      [booked, second]
    );
    expect(conflicts.map((c) => c.eventId).sort()).toEqual([
      'evt-lesson',
      'evt-mt',
    ]);
  });
});

describe('getDayStrip', () => {
  const dayStart = new Date('2026-06-11T13:00:00Z'); // 9:00 local-ish
  const dayEnd = new Date('2026-06-11T23:00:00Z');

  it('is one open band when nothing is booked', () => {
    const strip = getDayStrip([], dayStart, dayEnd);
    expect(strip).toEqual([{ kind: 'open', start: dayStart, end: dayEnd }]);
  });

  it('produces open · busy · open around a single booking', () => {
    const mt = win('2026-06-11T20:30:00Z', '2026-06-11T22:00:00Z', {
      title: 'Music Together',
    });
    const strip = getDayStrip([mt], dayStart, dayEnd);
    expect(strip.map((s) => s.kind)).toEqual(['open', 'busy', 'open']);
    expect(strip[1].start).toEqual(new Date('2026-06-11T20:30:00Z'));
    expect(strip[1].end).toEqual(new Date('2026-06-11T22:00:00Z'));
  });

  it('merges back-to-back bookings into one busy band carrying both', () => {
    const a = win('2026-06-11T20:00:00Z', '2026-06-11T20:30:00Z', {
      eventId: 'a',
    });
    const b = win('2026-06-11T20:30:00Z', '2026-06-11T21:00:00Z', {
      eventId: 'b',
    });
    const strip = getDayStrip([a, b], dayStart, dayEnd);
    expect(strip.map((s) => s.kind)).toEqual(['open', 'busy', 'open']);
    const busy = strip[1];
    expect(busy.kind === 'busy' && busy.windows).toHaveLength(2);
    expect(busy.end).toEqual(new Date('2026-06-11T21:00:00Z'));
  });

  it('clips a booking that overruns the day bounds', () => {
    const overrun = win('2026-06-11T12:00:00Z', '2026-06-12T02:00:00Z');
    const strip = getDayStrip([overrun], dayStart, dayEnd);
    expect(strip).toEqual([
      { kind: 'busy', start: dayStart, end: dayEnd, windows: [overrun] },
    ]);
  });
});
