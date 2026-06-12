import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '@maple/ts/domain';

/**
 * Tests for getRoomSchedule Cloud Function
 *
 * Verifies input validation and the mapping from room-scoped CalendarEvents
 * to serialized busy windows.
 */

const mocks = vi.hoisted(() => {
  return {
    findByRoomInRange: vi.fn(),
  };
});

vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: {
    findByRoomInRange: mocks.findByRoomInRange,
  },
}));

// Unwrap createAdminFunction so we can invoke the handler directly
vi.mock('@maple/firebase/functions', () => ({
  createAdminFunction: (handler: (data: unknown) => unknown) => handler,
  throwInvalidArgument: (message: string): never => {
    throw new Error(message);
  },
}));

import { getRoomSchedule } from './get-room-schedule';

const handler = getRoomSchedule as unknown as (
  data: unknown
) => Promise<{ windows: unknown[] }>;

function makeEvent(overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'lesson-abc',
    title: 'Music Lesson',
    description: '',
    startDateTime: new Date('2026-06-11T20:30:00Z'),
    endDateTime: new Date('2026-06-11T21:00:00Z'),
    recurrenceRule: null,
    location: '688 Beulah Road, Morgantown, WV 26508',
    type: 'lesson',
    public: false,
    room: 'spruce',
    sourceRef: 'lessons/abc',
    createdBy: 'system',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('getRoomSchedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findByRoomInRange.mockResolvedValue([]);
  });

  it('rejects an unknown room', async () => {
    await expect(
      handler({
        room: 'attic',
        start: '2026-06-11T00:00:00Z',
        end: '2026-06-12T00:00:00Z',
      })
    ).rejects.toThrow();
    expect(mocks.findByRoomInRange).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid date range', async () => {
    await expect(
      handler({ room: 'spruce', start: 'not-a-date', end: '2026-06-12' })
    ).rejects.toThrow();
    await expect(handler({ room: 'spruce' })).rejects.toThrow();
  });

  it('rejects an inverted range', async () => {
    await expect(
      handler({
        room: 'spruce',
        start: '2026-06-12T00:00:00Z',
        end: '2026-06-11T00:00:00Z',
      })
    ).rejects.toThrow();
  });

  it('queries the repository with parsed dates and maps events to windows', async () => {
    mocks.findByRoomInRange.mockResolvedValue([makeEvent()]);

    const result = await handler({
      room: 'spruce',
      start: '2026-06-11T00:00:00.000Z',
      end: '2026-06-12T00:00:00.000Z',
    });

    expect(mocks.findByRoomInRange).toHaveBeenCalledWith(
      'spruce',
      new Date('2026-06-11T00:00:00.000Z'),
      new Date('2026-06-12T00:00:00.000Z')
    );
    expect(result.windows).toEqual([
      {
        eventId: 'lesson-abc',
        title: 'Music Lesson',
        type: 'lesson',
        sourceRef: 'lessons/abc',
        start: '2026-06-11T20:30:00.000Z',
        end: '2026-06-11T21:00:00.000Z',
      },
    ]);
  });

  it('returns an empty list when the room has no events in range', async () => {
    const result = await handler({
      room: 'spruce',
      start: '2026-06-11T00:00:00Z',
      end: '2026-06-12T00:00:00Z',
    });
    expect(result.windows).toEqual([]);
  });
});
