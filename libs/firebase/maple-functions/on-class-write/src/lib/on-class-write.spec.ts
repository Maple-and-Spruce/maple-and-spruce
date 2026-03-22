import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CalendarEvent } from '@maple/ts/domain';

/**
 * Tests for onClassWrite Firestore trigger
 *
 * Verifies that class create/update/delete correctly
 * generates, updates, or removes CalendarEvents.
 */

// Mock firebase-admin
vi.mock('firebase-admin', () => ({
  default: { apps: [{}], initializeApp: vi.fn() },
}));

// Define mocks using vi.hoisted
const mocks = vi.hoisted(() => {
  return {
    findBySourceRef: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
});

// Mock CalendarEventRepository
vi.mock('@maple/firebase/database', () => ({
  CalendarEventRepository: {
    findBySourceRef: mocks.findBySourceRef,
    create: mocks.create,
    update: mocks.update,
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
  data?: Record<string, unknown>
) {
  return {
    exists,
    id: 'class-123',
    data: () => (exists ? data : undefined),
  };
}

// Standard class data
const publishedClassData = {
  name: 'Intro to Weaving',
  description: 'Learn the basics of weaving.',
  dateTime: { toDate: () => new Date('2030-06-15T14:00:00Z') },
  durationMinutes: 120,
  capacity: 10,
  priceCents: 4500,
  skillLevel: 'beginner',
  status: 'published',
  location: 'Workshop Room',
  createdAt: { toDate: () => new Date('2025-01-01') },
  updatedAt: { toDate: () => new Date('2025-01-01') },
};

const draftClassData = {
  ...publishedClassData,
  status: 'draft',
};

const existingCalendarEvent: CalendarEvent = {
  id: 'cal-evt-1',
  title: 'Intro to Weaving',
  description: 'Learn the basics of weaving.',
  startDateTime: new Date('2030-06-15T14:00:00Z'),
  endDateTime: new Date('2030-06-15T16:00:00Z'),
  recurrenceRule: null,
  location: 'Workshop Room',
  type: 'class',
  public: true,
  sourceRef: 'classes/class-123',
  createdBy: 'system',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('onClassWrite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('class created', () => {
    it('creates CalendarEvent when published class is created', async () => {
      mocks.create.mockResolvedValue(existingCalendarEvent);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, publishedClassData),
        },
      });

      expect(mocks.create).toHaveBeenCalledOnce();
      const createArg = mocks.create.mock.calls[0][0];
      expect(createArg.title).toBe('Intro to Weaving');
      expect(createArg.type).toBe('class');
      expect(createArg.public).toBe(true);
      expect(createArg.sourceRef).toBe('classes/class-123');
      // endDateTime = dateTime + 120 min
      expect(createArg.endDateTime.getTime()).toBe(
        createArg.startDateTime.getTime() + 120 * 60 * 1000
      );
    });

    it('does NOT create CalendarEvent when draft class is created', async () => {
      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, draftClassData),
        },
      });

      expect(mocks.create).not.toHaveBeenCalled();
    });
  });

  describe('class updated', () => {
    it('updates existing CalendarEvent when published class is updated', async () => {
      mocks.findBySourceRef.mockResolvedValue(existingCalendarEvent);
      mocks.update.mockResolvedValue(existingCalendarEvent);

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

      expect(mocks.findBySourceRef).toHaveBeenCalledWith('classes/class-123');
      expect(mocks.update).toHaveBeenCalledOnce();
      expect(mocks.update.mock.calls[0][0].title).toBe('Advanced Weaving');
      expect(mocks.update.mock.calls[0][0].public).toBe(true);
    });

    it('sets public=false when class is unpublished', async () => {
      mocks.findBySourceRef.mockResolvedValue(existingCalendarEvent);
      mocks.update.mockResolvedValue({ ...existingCalendarEvent, public: false });

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, publishedClassData),
          after: makeSnapshot(true, { ...publishedClassData, status: 'cancelled' }),
        },
      });

      expect(mocks.update).toHaveBeenCalledOnce();
      expect(mocks.update.mock.calls[0][0].public).toBe(false);
    });

    it('creates CalendarEvent when class is published for first time (no existing event)', async () => {
      mocks.findBySourceRef.mockResolvedValue(undefined);
      mocks.create.mockResolvedValue(existingCalendarEvent);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, draftClassData),
          after: makeSnapshot(true, publishedClassData),
        },
      });

      expect(mocks.findBySourceRef).toHaveBeenCalledWith('classes/class-123');
      expect(mocks.create).toHaveBeenCalledOnce();
      expect(mocks.create.mock.calls[0][0].type).toBe('class');
      expect(mocks.create.mock.calls[0][0].public).toBe(true);
    });

    it('does NOT create CalendarEvent when draft class updated while still draft', async () => {
      mocks.findBySourceRef.mockResolvedValue(undefined);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, draftClassData),
          after: makeSnapshot(true, { ...draftClassData, name: 'New Name' }),
        },
      });

      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.update).not.toHaveBeenCalled();
    });
  });

  describe('class deleted', () => {
    it('deletes CalendarEvent when class is deleted', async () => {
      mocks.findBySourceRef.mockResolvedValue(existingCalendarEvent);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, publishedClassData),
          after: makeSnapshot(false),
        },
      });

      expect(mocks.findBySourceRef).toHaveBeenCalledWith('classes/class-123');
      expect(mocks.delete).toHaveBeenCalledWith('cal-evt-1');
    });

    it('handles deletion gracefully when no CalendarEvent exists', async () => {
      mocks.findBySourceRef.mockResolvedValue(undefined);

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(true, draftClassData),
          after: makeSnapshot(false),
        },
      });

      expect(mocks.findBySourceRef).toHaveBeenCalledWith('classes/class-123');
      expect(mocks.delete).not.toHaveBeenCalled();
    });
  });

  describe('end time calculation', () => {
    it('computes endDateTime correctly from dateTime + durationMinutes', async () => {
      mocks.create.mockResolvedValue(existingCalendarEvent);

      const classData = {
        ...publishedClassData,
        dateTime: { toDate: () => new Date('2030-06-15T18:00:00Z') },
        durationMinutes: 90,
      };

      await handler({
        params: { classId: 'class-123' },
        data: {
          before: makeSnapshot(false),
          after: makeSnapshot(true, classData),
        },
      });

      const createArg = mocks.create.mock.calls[0][0];
      expect(createArg.startDateTime).toEqual(new Date('2030-06-15T18:00:00Z'));
      expect(createArg.endDateTime).toEqual(new Date('2030-06-15T19:30:00Z'));
    });
  });
});
