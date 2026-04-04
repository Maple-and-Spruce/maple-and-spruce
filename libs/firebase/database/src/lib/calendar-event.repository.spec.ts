import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database config module
vi.mock('./utilities/database.config', () => ({
  db: {
    collection: vi.fn(),
  },
  toDate: (value: unknown, fallback: Date = new Date()): Date => {
    if (value === null || value === undefined) return fallback;
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: unknown }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? fallback : parsed;
    }
    return fallback;
  },
}));

import { CalendarEventRepository } from './calendar-event.repository';
import { db } from './utilities/database.config';

describe('CalendarEventRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('converts date strings to Date objects for Firestore storage', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'event-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await CalendarEventRepository.create({
        title: 'Open Jam',
        description: 'Weekly jam session',
        startDateTime: '2026-05-15T18:00:00.000Z' as unknown as Date,
        endDateTime: '2026-05-15T20:00:00.000Z' as unknown as Date,
        recurrenceRule: null,
        location: 'Main Hall',
        type: 'jam',
        public: true,
        sourceRef: null,
        createdBy: 'admin',
      });

      expect(mockSet).toHaveBeenCalled();
      expect(savedData.startDateTime).toBeInstanceOf(Date);
      expect(savedData.endDateTime).toBeInstanceOf(Date);
      expect((savedData.startDateTime as Date).toISOString()).toBe(
        '2026-05-15T18:00:00.000Z'
      );
      expect((savedData.endDateTime as Date).toISOString()).toBe(
        '2026-05-15T20:00:00.000Z'
      );
      expect(savedData.createdAt).toBeInstanceOf(Date);
      expect(savedData.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('update', () => {
    it('converts date strings to Date objects on update', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = {
        exists: true,
        id: 'event-1',
        data: () => ({
          title: 'Open Jam',
          description: 'Weekly jam',
          startDateTime: { toDate: () => new Date('2026-05-15T19:00:00.000Z') },
          endDateTime: { toDate: () => new Date('2026-05-15T21:00:00.000Z') },
          recurrenceRule: null,
          location: 'Main Hall',
          type: 'jam',
          public: true,
          sourceRef: null,
          createdBy: 'admin',
          createdAt: { toDate: () => new Date('2026-01-01') },
          updatedAt: { toDate: () => new Date('2026-01-01') },
        }),
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await CalendarEventRepository.update({
        id: 'event-1',
        startDateTime: '2026-05-15T19:00:00.000Z' as unknown as Date,
        endDateTime: '2026-05-15T21:00:00.000Z' as unknown as Date,
      });

      expect(updatedFields.startDateTime).toBeInstanceOf(Date);
      expect(updatedFields.endDateTime).toBeInstanceOf(Date);
    });

    it('does not add date fields when not being updated', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = {
        exists: true,
        id: 'event-1',
        data: () => ({
          title: 'New Title',
          description: 'desc',
          startDateTime: { toDate: () => new Date('2026-05-15T18:00:00.000Z') },
          endDateTime: { toDate: () => new Date('2026-05-15T20:00:00.000Z') },
          recurrenceRule: null,
          location: 'Main Hall',
          type: 'jam',
          public: true,
          sourceRef: null,
          createdBy: 'admin',
          createdAt: { toDate: () => new Date('2026-01-01') },
          updatedAt: { toDate: () => new Date('2026-01-01') },
        }),
      };

      const mockGet = vi.fn().mockResolvedValue(mockDoc);
      const mockDocRef = vi.fn().mockReturnValue({
        update: mockUpdate,
        get: mockGet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await CalendarEventRepository.update({
        id: 'event-1',
        title: 'New Title',
      });

      expect(updatedFields.startDateTime).toBeUndefined();
      expect(updatedFields.endDateTime).toBeUndefined();
      expect(updatedFields.title).toBe('New Title');
    });
  });
});
