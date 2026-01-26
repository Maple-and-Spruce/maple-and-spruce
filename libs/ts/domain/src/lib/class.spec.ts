import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toPublicClass,
  formatClassPrice,
  isClassRegistrationOpen,
  hasAvailableSpots,
  getClassEndTime,
  type Class,
} from './class';

describe('Class domain helpers', () => {
  const baseClass: Class = {
    id: 'class-123',
    name: 'Introduction to Weaving',
    description: 'Learn the basics of weaving in this hands-on workshop.',
    shortDescription: 'A beginner-friendly weaving workshop.',
    instructorId: 'instructor-456',
    dateTime: new Date('2030-06-15T14:00:00Z'),
    durationMinutes: 120,
    capacity: 8,
    priceCents: 4500,
    imageUrl: 'https://example.com/weaving.jpg',
    categoryId: 'cat-fiber',
    skillLevel: 'beginner',
    status: 'published',
    location: 'Maple & Spruce Workshop',
    materialsIncluded: 'Loom, yarn, shuttle',
    whatToBring: 'Notebook, scissors',
    minimumAge: 12,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  };

  describe('toPublicClass', () => {
    it('converts Class to PublicClass with all fields', () => {
      const result = toPublicClass(
        baseClass,
        'Sarah Miller',
        'Fiber Arts',
        3
      );

      expect(result).toEqual({
        id: 'class-123',
        name: 'Introduction to Weaving',
        shortDescription: 'A beginner-friendly weaving workshop.',
        description: 'Learn the basics of weaving in this hands-on workshop.',
        instructorId: 'instructor-456',
        instructorName: 'Sarah Miller',
        dateTime: '2030-06-15T14:00:00.000Z',
        durationMinutes: 120,
        capacity: 8,
        spotsRemaining: 5, // 8 - 3
        priceCents: 4500,
        imageUrl: 'https://example.com/weaving.jpg',
        categoryId: 'cat-fiber',
        categoryName: 'Fiber Arts',
        skillLevel: 'beginner',
        location: 'Maple & Spruce Workshop',
        materialsIncluded: 'Loom, yarn, shuttle',
        whatToBring: 'Notebook, scissors',
        minimumAge: 12,
      });
    });

    it('handles undefined enrichment data', () => {
      const result = toPublicClass(baseClass);

      expect(result.instructorName).toBeUndefined();
      expect(result.categoryName).toBeUndefined();
      expect(result.spotsRemaining).toBe(8); // capacity - 0
    });

    it('calculates spotsRemaining correctly', () => {
      expect(toPublicClass(baseClass, undefined, undefined, 0).spotsRemaining).toBe(8);
      expect(toPublicClass(baseClass, undefined, undefined, 5).spotsRemaining).toBe(3);
      expect(toPublicClass(baseClass, undefined, undefined, 8).spotsRemaining).toBe(0);
    });

    it('clamps spotsRemaining to 0 (no negative)', () => {
      // Over-registration edge case
      expect(toPublicClass(baseClass, undefined, undefined, 10).spotsRemaining).toBe(0);
    });

    it('converts dateTime to ISO string', () => {
      const result = toPublicClass(baseClass);
      expect(result.dateTime).toBe('2030-06-15T14:00:00.000Z');
    });
  });

  describe('formatClassPrice', () => {
    it('formats whole dollar amounts without decimals', () => {
      expect(formatClassPrice(4500)).toBe('$45');
      expect(formatClassPrice(10000)).toBe('$100');
      expect(formatClassPrice(0)).toBe('$0');
    });

    it('formats amounts with cents', () => {
      expect(formatClassPrice(4550)).toBe('$45.50');
      expect(formatClassPrice(4599)).toBe('$45.99');
      expect(formatClassPrice(99)).toBe('$0.99');
    });
  });

  describe('isClassRegistrationOpen', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15T00:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true for published class in the future', () => {
      const futureClass: Class = {
        ...baseClass,
        status: 'published',
        dateTime: new Date('2025-06-15T14:00:00Z'),
      };
      expect(isClassRegistrationOpen(futureClass)).toBe(true);
    });

    it('returns false for draft class', () => {
      const draftClass: Class = {
        ...baseClass,
        status: 'draft',
        dateTime: new Date('2025-06-15T14:00:00Z'),
      };
      expect(isClassRegistrationOpen(draftClass)).toBe(false);
    });

    it('returns false for cancelled class', () => {
      const cancelledClass: Class = {
        ...baseClass,
        status: 'cancelled',
        dateTime: new Date('2025-06-15T14:00:00Z'),
      };
      expect(isClassRegistrationOpen(cancelledClass)).toBe(false);
    });

    it('returns false for completed class', () => {
      const completedClass: Class = {
        ...baseClass,
        status: 'completed',
        dateTime: new Date('2025-06-15T14:00:00Z'),
      };
      expect(isClassRegistrationOpen(completedClass)).toBe(false);
    });

    it('returns false for published class in the past', () => {
      const pastClass: Class = {
        ...baseClass,
        status: 'published',
        dateTime: new Date('2024-06-15T14:00:00Z'),
      };
      expect(isClassRegistrationOpen(pastClass)).toBe(false);
    });
  });

  describe('hasAvailableSpots', () => {
    it('returns true when there are spots available', () => {
      expect(hasAvailableSpots(baseClass, 0)).toBe(true);
      expect(hasAvailableSpots(baseClass, 5)).toBe(true);
      expect(hasAvailableSpots(baseClass, 7)).toBe(true);
    });

    it('returns false when class is full', () => {
      expect(hasAvailableSpots(baseClass, 8)).toBe(false);
    });

    it('returns false when over-registered (edge case)', () => {
      expect(hasAvailableSpots(baseClass, 10)).toBe(false);
    });
  });

  describe('getClassEndTime', () => {
    it('calculates end time correctly', () => {
      const result = getClassEndTime(baseClass);
      // 14:00 + 120 minutes = 16:00
      expect(result).toEqual(new Date('2030-06-15T16:00:00.000Z'));
    });

    it('handles 30-minute class', () => {
      const shortClass: Class = {
        ...baseClass,
        dateTime: new Date('2030-06-15T10:00:00Z'),
        durationMinutes: 30,
      };
      const result = getClassEndTime(shortClass);
      expect(result).toEqual(new Date('2030-06-15T10:30:00.000Z'));
    });

    it('handles 8-hour class', () => {
      const longClass: Class = {
        ...baseClass,
        dateTime: new Date('2030-06-15T09:00:00Z'),
        durationMinutes: 480,
      };
      const result = getClassEndTime(longClass);
      expect(result).toEqual(new Date('2030-06-15T17:00:00.000Z'));
    });
  });
});
