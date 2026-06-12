import { describe, it, expect } from 'vitest';
import { getRoomStatus, getRoomLabel, type RoomBusyWindow } from './room';

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
