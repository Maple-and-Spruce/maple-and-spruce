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
    it('converts dateTime string to Date object for Firestore storage', async () => {
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
        shortDescription: null,
        instructorId: null,
        dateTime: '2026-05-15T14:00:00.000Z' as unknown as Date,
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
      });

      expect(mockSet).toHaveBeenCalled();
      // dateTime should be a Date object, not a string
      expect(savedData.dateTime).toBeInstanceOf(Date);
      expect((savedData.dateTime as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
      // createdAt/updatedAt should also be Date objects
      expect(savedData.createdAt).toBeInstanceOf(Date);
      expect(savedData.updatedAt).toBeInstanceOf(Date);
    });

    it('handles dateTime that is already a Date object', async () => {
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
        shortDescription: null,
        instructorId: null,
        dateTime: dateObj,
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
      });

      expect(savedData.dateTime).toBeInstanceOf(Date);
      expect((savedData.dateTime as Date).toISOString()).toBe(
        '2026-05-15T14:00:00.000Z'
      );
    });
  });

  describe('update', () => {
    it('converts dateTime string to Date object on update', async () => {
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
          dateTime: { toDate: () => new Date('2026-05-20T14:00:00.000Z') },
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
        dateTime: '2026-05-20T14:00:00.000Z' as unknown as Date,
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(updatedFields.dateTime).toBeInstanceOf(Date);
      expect((updatedFields.dateTime as Date).toISOString()).toBe(
        '2026-05-20T14:00:00.000Z'
      );
    });

    it('does not add dateTime field when not being updated', async () => {
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
          dateTime: { toDate: () => new Date('2026-05-15T14:00:00.000Z') },
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

      expect(updatedFields.dateTime).toBeUndefined();
      expect(updatedFields.name).toBe('Updated Name');
      expect(updatedFields.updatedAt).toBeInstanceOf(Date);
    });
  });
});
