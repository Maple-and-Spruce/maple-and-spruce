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

import { ClassRepository } from './class.repository';
import { db } from './utilities/database.config';

describe('ClassRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('converts session dateTime strings to Date objects for Firestore storage', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'class-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.create({
        name: 'Pottery 101',
        description: 'Learn pottery',
        shortDescription: undefined,
        instructorId: undefined,
        sessions: [
          { dateTime: '2026-05-15T14:00:00.000Z' as unknown as Date },
        ],
        durationMinutes: 120,
        capacity: 10,
        priceCents: 4500,
        imageUrl: undefined,
        categoryId: undefined,
        skillLevel: 'all-levels',
        status: 'published',
        location: undefined,
        materialsIncluded: undefined,
        whatToBring: undefined,
        minimumAge: undefined,
      });

      expect(mockSet).toHaveBeenCalled();
      // sessions should be an array with dateTime as Date objects
      expect(savedData.sessions).toBeInstanceOf(Array);
      const sessions = savedData.sessions as { dateTime: unknown }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].dateTime).toBeInstanceOf(Date);
      expect((sessions[0].dateTime as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
      // firstSessionAt should be written as a denormalized field
      expect(savedData.firstSessionAt).toBeInstanceOf(Date);
      expect((savedData.firstSessionAt as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
      // createdAt/updatedAt should also be Date objects
      expect(savedData.createdAt).toBeInstanceOf(Date);
      expect(savedData.updatedAt).toBeInstanceOf(Date);
    });

    it('handles sessions with dateTime already as Date objects', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'class-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      const dateObj = new Date('2026-05-15T14:00:00.000Z');
      await ClassRepository.create({
        name: 'Pottery 101',
        description: 'Learn pottery',
        shortDescription: undefined,
        instructorId: undefined,
        sessions: [{ dateTime: dateObj }],
        durationMinutes: 120,
        capacity: 10,
        priceCents: 4500,
        imageUrl: undefined,
        categoryId: undefined,
        skillLevel: 'all-levels',
        status: 'published',
        location: undefined,
        materialsIncluded: undefined,
        whatToBring: undefined,
        minimumAge: undefined,
      });

      const sessions = savedData.sessions as { dateTime: unknown }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].dateTime).toBeInstanceOf(Date);
      expect((sessions[0].dateTime as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
      expect(savedData.firstSessionAt).toBeInstanceOf(Date);
      expect((savedData.firstSessionAt as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
    });

    it('sorts multiple sessions by dateTime and sets firstSessionAt to the earliest', async () => {
      let savedData: Record<string, unknown> = {};
      const mockSet = vi.fn().mockImplementation((data) => {
        savedData = data;
        return Promise.resolve();
      });

      const mockDocRef = vi.fn().mockReturnValue({
        id: 'class-new',
        set: mockSet,
      });
      const mockCollection = vi.fn().mockReturnValue({ doc: mockDocRef });
      vi.mocked(db.collection).mockImplementation(mockCollection);

      await ClassRepository.create({
        name: 'Multi-Session Workshop',
        description: 'A two-day workshop',
        shortDescription: undefined,
        instructorId: undefined,
        sessions: [
          { dateTime: new Date('2026-06-02T14:00:00.000Z') },
          { dateTime: new Date('2026-06-01T10:00:00.000Z') },
        ],
        durationMinutes: 180,
        capacity: 8,
        priceCents: 9000,
        imageUrl: undefined,
        categoryId: undefined,
        skillLevel: 'all-levels',
        status: 'published',
        location: undefined,
        materialsIncluded: undefined,
        whatToBring: undefined,
        minimumAge: undefined,
      });

      const sessions = savedData.sessions as { dateTime: Date }[];
      expect(sessions).toHaveLength(2);
      // Should be sorted chronologically
      expect(sessions[0].dateTime.toISOString()).toBe(
        '2026-06-01T10:00:00.000Z'
      );
      expect(sessions[1].dateTime.toISOString()).toBe(
        '2026-06-02T14:00:00.000Z'
      );
      // firstSessionAt should be the earliest session
      expect((savedData.firstSessionAt as Date).toISOString()).toBe(
        '2026-06-01T10:00:00.000Z'
      );
    });
  });

  describe('update', () => {
    it('converts session dateTime strings to Date objects on update', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = {
        exists: true,
        id: 'class-1',
        data: () => ({
          name: 'Pottery 101',
          description: 'Learn pottery',
          shortDescription: null,
          instructorId: null,
          sessions: [
            {
              dateTime: {
                toDate: () => new Date('2026-05-20T14:00:00.000Z'),
              },
            },
          ],
          firstSessionAt: {
            toDate: () => new Date('2026-05-20T14:00:00.000Z'),
          },
          durationMinutes: 120,
          capacity: 10,
          priceCents: 4500,
          imageUrl: null,
          categoryId: null,
          skillLevel: 'all-levels',
          status: 'published',
          location: null,
          materialsIncluded: null,
          whatToBring: null,
          minimumAge: null,
          webflowItemId: null,
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

      await ClassRepository.update({
        id: 'class-1',
        sessions: [
          { dateTime: '2026-05-20T14:00:00.000Z' as unknown as Date },
        ],
      });

      expect(mockUpdate).toHaveBeenCalled();
      const sessions = updatedFields.sessions as { dateTime: unknown }[];
      expect(sessions).toHaveLength(1);
      expect(sessions[0].dateTime).toBeInstanceOf(Date);
      expect((sessions[0].dateTime as Date).toISOString()).toBe(
        '2026-05-20T14:00:00.000Z'
      );
      // firstSessionAt should also be updated
      expect(updatedFields.firstSessionAt).toBeInstanceOf(Date);
      expect((updatedFields.firstSessionAt as Date).toISOString()).toBe(
        '2026-05-20T14:00:00.000Z'
      );
    });

    it('does not add sessions or firstSessionAt fields when sessions are not being updated', async () => {
      let updatedFields: Record<string, unknown> = {};
      const mockUpdate = vi.fn().mockImplementation((data) => {
        updatedFields = data;
        return Promise.resolve();
      });

      const mockDoc = {
        exists: true,
        id: 'class-1',
        data: () => ({
          name: 'Updated Name',
          description: 'desc',
          shortDescription: null,
          instructorId: null,
          sessions: [
            {
              dateTime: {
                toDate: () => new Date('2026-05-15T14:00:00.000Z'),
              },
            },
          ],
          firstSessionAt: {
            toDate: () => new Date('2026-05-15T14:00:00.000Z'),
          },
          durationMinutes: 120,
          capacity: 10,
          priceCents: 4500,
          imageUrl: null,
          categoryId: null,
          skillLevel: 'all-levels',
          status: 'published',
          location: null,
          materialsIncluded: null,
          whatToBring: null,
          minimumAge: null,
          webflowItemId: null,
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

      await ClassRepository.update({
        id: 'class-1',
        name: 'Updated Name',
      });

      expect(updatedFields.sessions).toBeUndefined();
      expect(updatedFields.firstSessionAt).toBeUndefined();
      expect(updatedFields.name).toBe('Updated Name');
      expect(updatedFields.updatedAt).toBeInstanceOf(Date);
    });
  });
});
