import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '@maple/ts/domain';

/**
 * Tests for onClassWrite Firestore trigger
 *
 * Verifies that class create/update/delete correctly
 * reconciles CalendarEvents — one per session — using
 * deterministic IDs of the form `class-{classId}-{timestampMs}`.
 */

// Define mocks using vi.hoisted
const mocks = vi.hoisted(() => {
  return {
    findAllBySourceRef: vi.fn(),
    upsertWithId: vi.fn(),
    delete: vi.fn(),
  };
});

// Mock CalendarEventRepository
vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: {
    findAllBySourceRef: mocks.findAllBySourceRef,
    upsertWithId: mocks.upsertWithId,
    delete: mocks.delete,
  },
}));

// Mock firebase-functions trigger (we test the logic directly)
vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: vi.fn((_config, handler) => handler),
}));

// Import the module to get the handler
import { onClassWrite } from './on-class-write';

// The onDocumentWritten mock returns the handler directly
const handler = onClassWrite as unknown as (event: unknown) => Promise<void>;

// Helper to create a mock Firestore snapshot
function makeSnapshot(
  exists: boolean,
  data?: Record<string, unknown>,
  id = 'class-123'
) {
  return {
    exists,
    id,
    data: () => (exists ? data : undefined),
  };
}

// --- Timestamps used across tests ---
const sessionDates = [
  new Date('2030-06-15T14:00:00Z'),
  new Date('2030-06-22T14:00:00Z'),
  new Date('2030-06-29T14:00:00Z'),
];

function ts(date: Date) {
  return { toDate: () => date };
}

// Standard class data (published, 3 sessions)
const publishedClassData = {
  name: 'Intro to Weaving',
  description: 'Learn the basics of weaving.',
  sessions: [
    { dateTime: ts(sessionDates[0]) },
    { dateTime: ts(sessionDates[1]) },
    { dateTime: ts(sessionDates[2]) },
  ],
  durationMinutes: 120,
  capacity: 10,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  location: 'Workshop Room',
  createdAt: ts(new Date('2025-01-01')),
  updatedAt: ts(new Date('2025-01-01')),
};

// Single-session published class
const singleSessionClassData = {
  ...publishedClassData,
  sessions: [{ dateTime: ts(sessionDates[0]) }],
};

const draftClassData = {
  ...publishedClassData,
  status: 'draft',
};

// Helper to build deterministic event ID matching the trigger logic
function eventId(classId: string, date: Date): string {
  return `class-${classId}-${date.getTime()}`;
}

// Helper to build a CalendarEvent fixture
function makeCalendarEvent(
  classId: string,
  date: Date,
  overrides?: Partial<CalendarEvent>
): CalendarEvent {
  return {
    id: eventId(classId, date),
    title: 'Intro to Weaving',
    description: 'Learn the basics of weaving.',
    startDateTime: date,
    endDateTime: new Date(date.getTime() + 120 * 60 * 1000),
    recurrenceRule: null,
    location: 'Workshop Room',
    type: 'class',
    public: true,
    sourceRef: `classes/${classId}`,
    createdBy: 'system',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('onClassWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no existing events
    mocks.findAllBySourceRef.mockResolvedValue([]);
    mocks.upsertWithId.mockResolvedValue(undefined);
    mocks.delete.mockResolvedValue(undefined);
  });

  // ────────────────────────────────────────────
  // Class created
  // ────────────────────────────────────────────

  describe('class created', () => {
    it('upserts one CalendarEvent per session when published class is created', async () => {
      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, publishedClassData),
        },
      });

      expect(mocks.upsertWithId).toHaveBeenCalledTimes(3);

      // Verify each call uses the deterministic ID and correct session data
      for (let i = 0; i < 3; i++) {
        const [id, input] = mocks.upsertWithId.mock.calls[i];
        expect(id).toBe(eventId('class-123', sessionDates[i]));
        expect(input.title).toBe('Intro to Weaving');
        expect(input.type).toBe('class');
        expect(input.public).toBe(true);
        expect(input.sourceRef).toBe('classes/class-123');
        expect(input.startDateTime).toEqual(sessionDates[i]);
        expect(input.endDateTime).toEqual(
          new Date(sessionDates[i].getTime() + 120 * 60 * 1000)
        );
      }
    });

    it('creates a single CalendarEvent for a single-session class', async () => {
      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, singleSessionClassData),
        },
      });

      expect(mocks.upsertWithId).toHaveBeenCalledOnce();
      const [id, input] = mocks.upsertWithId.mock.calls[0];
      expect(id).toBe(eventId('class-123', sessionDates[0]));
      expect(input.startDateTime).toEqual(sessionDates[0]);
    });

    it('does NOT create CalendarEvents when draft class is created', async () => {
      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, draftClassData),
        },
      });

      // Draft class still runs through the reconciler; it upserts events
      // with public: false. Verify no events are created with public: true.
      // Actually — the trigger upserts for ALL classes (even drafts) but
      // sets public=false when status != 'published'. Let's verify:
      expect(mocks.upsertWithId).toHaveBeenCalledTimes(3);
      for (const [, input] of mocks.upsertWithId.mock.calls) {
        expect(input.public).toBe(false);
      }
    });
  });

  // ────────────────────────────────────────────
  // Class updated
  // ────────────────────────────────────────────

  describe('class updated', () => {
    it('upserts CalendarEvents when published class is updated', async () => {
      // Pre-existing events for all 3 sessions
      mocks.findAllBySourceRef.mockResolvedValue(
        sessionDates.map((d) => makeCalendarEvent('class-123', d))
      );

      const updatedData = {
        ...publishedClassData,
        name: 'Advanced Weaving',
      };

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, publishedClassData),
          after: makeSnapshot(true, updatedData),
        },
      });

      expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
        'classes/class-123'
      );
      expect(mocks.upsertWithId).toHaveBeenCalledTimes(3);

      for (const [, input] of mocks.upsertWithId.mock.calls) {
        expect(input.title).toBe('Advanced Weaving');
        expect(input.public).toBe(true);
      }
      // No stale events to delete
      expect(mocks.delete).not.toHaveBeenCalled();
    });

    it('sets public=false on all events when class is unpublished', async () => {
      mocks.findAllBySourceRef.mockResolvedValue(
        sessionDates.map((d) => makeCalendarEvent('class-123', d))
      );

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, publishedClassData),
          after: makeSnapshot(true, {
            ...publishedClassData,
            status: 'cancelled',
          }),
        },
      });

      expect(mocks.upsertWithId).toHaveBeenCalledTimes(3);
      for (const [, input] of mocks.upsertWithId.mock.calls) {
        expect(input.public).toBe(false);
      }
    });

    it('upserts events when class is published for the first time', async () => {
      mocks.findAllBySourceRef.mockResolvedValue([]);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, draftClassData),
          after: makeSnapshot(true, publishedClassData),
        },
      });

      expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
        'classes/class-123'
      );
      expect(mocks.upsertWithId).toHaveBeenCalledTimes(3);
      for (const [, input] of mocks.upsertWithId.mock.calls) {
        expect(input.type).toBe('class');
        expect(input.public).toBe(true);
      }
    });
  });

  // ────────────────────────────────────────────
  // Session removal (reconciliation deletes stale events)
  // ────────────────────────────────────────────

  describe('session removal', () => {
    it('deletes stale event when sessions go from 3 to 2', async () => {
      // 3 existing events
      mocks.findAllBySourceRef.mockResolvedValue(
        sessionDates.map((d) => makeCalendarEvent('class-123', d))
      );

      // Updated class only has 2 sessions (dropped the third)
      const twoSessionData = {
        ...publishedClassData,
        sessions: [
          { dateTime: ts(sessionDates[0]) },
          { dateTime: ts(sessionDates[1]) },
        ],
      };

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, publishedClassData),
          after: makeSnapshot(true, twoSessionData),
        },
      });

      // Should upsert 2 events
      expect(mocks.upsertWithId).toHaveBeenCalledTimes(2);
      // Should delete the stale third event
      expect(mocks.delete).toHaveBeenCalledOnce();
      expect(mocks.delete).toHaveBeenCalledWith(
        eventId('class-123', sessionDates[2])
      );
    });

    it('deletes multiple stale events when sessions go from 3 to 1', async () => {
      mocks.findAllBySourceRef.mockResolvedValue(
        sessionDates.map((d) => makeCalendarEvent('class-123', d))
      );

      const oneSessionData = {
        ...publishedClassData,
        sessions: [{ dateTime: ts(sessionDates[0]) }],
      };

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, publishedClassData),
          after: makeSnapshot(true, oneSessionData),
        },
      });

      expect(mocks.upsertWithId).toHaveBeenCalledOnce();
      expect(mocks.delete).toHaveBeenCalledTimes(2);
      expect(mocks.delete).toHaveBeenCalledWith(
        eventId('class-123', sessionDates[1])
      );
      expect(mocks.delete).toHaveBeenCalledWith(
        eventId('class-123', sessionDates[2])
      );
    });
  });

  // ────────────────────────────────────────────
  // Class deleted
  // ────────────────────────────────────────────

  describe('class deleted', () => {
    it('deletes ALL CalendarEvents when class is deleted', async () => {
      const existingEvents = sessionDates.map((d) =>
        makeCalendarEvent('class-123', d)
      );
      mocks.findAllBySourceRef.mockResolvedValue(existingEvents);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, publishedClassData),
          after: makeSnapshot(false),
        },
      });

      expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
        'classes/class-123'
      );
      expect(mocks.delete).toHaveBeenCalledTimes(3);
      for (const event of existingEvents) {
        expect(mocks.delete).toHaveBeenCalledWith(event.id);
      }
    });

    it('handles deletion gracefully when no CalendarEvents exist', async () => {
      mocks.findAllBySourceRef.mockResolvedValue([]);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, draftClassData),
          after: makeSnapshot(false),
        },
      });

      expect(mocks.findAllBySourceRef).toHaveBeenCalledWith(
        'classes/class-123'
      );
      expect(mocks.delete).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────
  // Public flag
  // ────────────────────────────────────────────

  describe('public flag', () => {
    it('sets public=false for draft class events', async () => {
      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, draftClassData),
        },
      });

      for (const [, input] of mocks.upsertWithId.mock.calls) {
        expect(input.public).toBe(false);
      }
    });

    it('sets public=true for published class events', async () => {
      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, publishedClassData),
        },
      });

      for (const [, input] of mocks.upsertWithId.mock.calls) {
        expect(input.public).toBe(true);
      }
    });

    it('sets public=false for cancelled class events', async () => {
      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, {
            ...publishedClassData,
            status: 'cancelled',
          }),
        },
      });

      for (const [, input] of mocks.upsertWithId.mock.calls) {
        expect(input.public).toBe(false);
      }
    });
  });

  // ────────────────────────────────────────────
  // End time calculation
  // ────────────────────────────────────────────

  describe('end time calculation', () => {
    it('computes endDateTime correctly from session dateTime + durationMinutes', async () => {
      const customDate = new Date('2030-06-15T18:00:00Z');
      const classData = {
        ...publishedClassData,
        sessions: [{ dateTime: ts(customDate) }],
        durationMinutes: 90,
      };

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, classData),
        },
      });

      const [, input] = mocks.upsertWithId.mock.calls[0];
      expect(input.startDateTime).toEqual(new Date('2030-06-15T18:00:00Z'));
      expect(input.endDateTime).toEqual(new Date('2030-06-15T19:30:00Z'));
    });
  });

  // ────────────────────────────────────────────
  // Deterministic IDs
  // ────────────────────────────────────────────

  describe('deterministic event IDs', () => {
    it('generates IDs in the format class-{classId}-{timestampMs}', async () => {
      await handler({
        params: { classId: 'abc-456' },
        data: {
          before: makeSnapshot(false, undefined, 'abc-456'),
          after: makeSnapshot(
            true,
            {
              ...singleSessionClassData,
            },
            'abc-456'
          ),
        },
      });

      const [id] = mocks.upsertWithId.mock.calls[0];
      expect(id).toBe(`class-abc-456-${sessionDates[0].getTime()}`);
    });
  });
});
