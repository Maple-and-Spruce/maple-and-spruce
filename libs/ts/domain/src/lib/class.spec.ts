import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  toPublicClass,
  formatClassPrice,
  isClassRegistrationOpen,
  hasAvailableSpots,
  getSessionEndTime,
  getFirstSession,
  getSortedSessions,
  getRegistrationCutoff,
  formatSessions,
  type Class,
  type ClassSession,
} from './class';

describe('Class domain helpers', () => {
  const baseClass: Class = {
    id: 'class-123',
    name: 'Introduction to Weaving',
    description: 'Learn the basics of weaving in this hands-on workshop.',
    shortDescription: 'A beginner-friendly weaving workshop.',
    instructorId: 'instructor-456',
    sessions: [{ dateTime: new Date('2030-06-15T14:00:00Z') }],
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

  const multiSessionClass: Class = {
    ...baseClass,
    sessions: [
      { dateTime: new Date('2030-06-22T14:00:00Z') },
      { dateTime: new Date('2030-06-15T14:00:00Z') },
      { dateTime: new Date('2030-06-29T14:00:00Z') },
    ],
  };

  describe('getFirstSession', () => {
    it('returns earliest session regardless of array order', () => {
      const first = getFirstSession(multiSessionClass);
      expect(first.dateTime).toEqual(new Date('2030-06-15T14:00:00Z'));
    });

    it('throws for a class with no sessions', () => {
      const empty: Class = { ...baseClass, sessions: [] };
      expect(() => getFirstSession(empty)).toThrow('has no sessions');
    });
  });

  describe('getSortedSessions', () => {
    it('returns sessions sorted earliest first', () => {
      const sorted = getSortedSessions(multiSessionClass);
      expect(sorted.map((s) => s.dateTime.toISOString())).toEqual([
        '2030-06-15T14:00:00.000Z',
        '2030-06-22T14:00:00.000Z',
        '2030-06-29T14:00:00.000Z',
      ]);
    });

    it('does not mutate the original sessions array', () => {
      const before = multiSessionClass.sessions[0].dateTime.toISOString();
      getSortedSessions(multiSessionClass);
      expect(multiSessionClass.sessions[0].dateTime.toISOString()).toBe(before);
    });
  });

  describe('getRegistrationCutoff', () => {
    it('defaults to first session dateTime', () => {
      expect(getRegistrationCutoff(baseClass)).toEqual(
        new Date('2030-06-15T14:00:00Z')
      );
    });

    it('uses registrationClosesAt when set', () => {
      const cutoff = new Date('2030-06-10T00:00:00Z');
      const withOverride: Class = {
        ...baseClass,
        registrationClosesAt: cutoff,
      };
      expect(getRegistrationCutoff(withOverride)).toEqual(cutoff);
    });
  });

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
        slug: 'introduction-to-weaving',
        shortDescription: 'A beginner-friendly weaving workshop.',
        description: 'Learn the basics of weaving in this hands-on workshop.',
        instructorId: 'instructor-456',
        instructorName: 'Sarah Miller',
        sessions: [{ dateTime: '2030-06-15T14:00:00.000Z' }],
        registrationClosesAt: undefined,
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

    it('converts sessions to ISO strings', () => {
      const result = toPublicClass(multiSessionClass);
      expect(result.sessions).toEqual([
        { dateTime: '2030-06-15T14:00:00.000Z' },
        { dateTime: '2030-06-22T14:00:00.000Z' },
        { dateTime: '2030-06-29T14:00:00.000Z' },
      ]);
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

    it('returns true for published class with future first session', () => {
      const futureClass: Class = {
        ...baseClass,
        status: 'published',
        sessions: [{ dateTime: new Date('2025-06-15T14:00:00Z') }],
      };
      expect(isClassRegistrationOpen(futureClass)).toBe(true);
    });

    it('returns false for draft class', () => {
      const draftClass: Class = {
        ...baseClass,
        status: 'draft',
        sessions: [{ dateTime: new Date('2025-06-15T14:00:00Z') }],
      };
      expect(isClassRegistrationOpen(draftClass)).toBe(false);
    });

    it('returns false for cancelled class', () => {
      const cancelledClass: Class = {
        ...baseClass,
        status: 'cancelled',
        sessions: [{ dateTime: new Date('2025-06-15T14:00:00Z') }],
      };
      expect(isClassRegistrationOpen(cancelledClass)).toBe(false);
    });

    it('returns false for completed class', () => {
      const completedClass: Class = {
        ...baseClass,
        status: 'completed',
        sessions: [{ dateTime: new Date('2025-06-15T14:00:00Z') }],
      };
      expect(isClassRegistrationOpen(completedClass)).toBe(false);
    });

    it('returns false for published class with past first session', () => {
      const pastClass: Class = {
        ...baseClass,
        status: 'published',
        sessions: [{ dateTime: new Date('2024-06-15T14:00:00Z') }],
      };
      expect(isClassRegistrationOpen(pastClass)).toBe(false);
    });

    it('uses registrationClosesAt when set', () => {
      // First session is future, but registrationClosesAt is in the past
      const closedClass: Class = {
        ...baseClass,
        status: 'published',
        sessions: [{ dateTime: new Date('2025-06-15T14:00:00Z') }],
        registrationClosesAt: new Date('2024-12-01T00:00:00Z'),
      };
      expect(isClassRegistrationOpen(closedClass)).toBe(false);
    });

    it('is open when registrationClosesAt is in the future', () => {
      const openClass: Class = {
        ...baseClass,
        status: 'published',
        sessions: [{ dateTime: new Date('2025-06-15T14:00:00Z') }],
        registrationClosesAt: new Date('2025-06-01T00:00:00Z'),
      };
      expect(isClassRegistrationOpen(openClass)).toBe(true);
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

  describe('getSessionEndTime', () => {
    it('calculates end time correctly', () => {
      const session: ClassSession = { dateTime: new Date('2030-06-15T14:00:00Z') };
      const result = getSessionEndTime(session, 120);
      expect(result).toEqual(new Date('2030-06-15T16:00:00.000Z'));
    });

    it('handles 30-minute session', () => {
      const session: ClassSession = { dateTime: new Date('2030-06-15T10:00:00Z') };
      const result = getSessionEndTime(session, 30);
      expect(result).toEqual(new Date('2030-06-15T10:30:00.000Z'));
    });

    it('handles 8-hour session', () => {
      const session: ClassSession = { dateTime: new Date('2030-06-15T09:00:00Z') };
      const result = getSessionEndTime(session, 480);
      expect(result).toEqual(new Date('2030-06-15T17:00:00.000Z'));
    });
  });

  describe('formatSessions', () => {
    it('returns empty strings for empty sessions', () => {
      const result = formatSessions([]);
      expect(result).toEqual({
        dateDisplay: '',
        timeDisplay: '',
        sharedTime: true,
      });
    });

    it('formats a single session', () => {
      const result = formatSessions(
        [{ dateTime: new Date('2030-06-15T18:00:00Z') }],
        'America/New_York'
      );
      // 18:00 UTC = 2:00 PM ET
      expect(result.sharedTime).toBe(true);
      expect(result.dateDisplay).toContain('Jun');
      expect(result.dateDisplay).toContain('15');
    });

    it('detects shared time across sessions', () => {
      const result = formatSessions(
        [
          { dateTime: new Date('2030-06-15T18:00:00Z') },
          { dateTime: new Date('2030-06-22T18:00:00Z') },
        ],
        'America/New_York'
      );
      expect(result.sharedTime).toBe(true);
      // Both dates should be listed
      expect(result.dateDisplay).toContain('Jun 15');
      expect(result.dateDisplay).toContain('Jun 22');
    });

    it('detects different times across sessions', () => {
      const result = formatSessions(
        [
          { dateTime: new Date('2030-06-15T18:00:00Z') },
          { dateTime: new Date('2030-06-22T19:00:00Z') },
        ],
        'America/New_York'
      );
      expect(result.sharedTime).toBe(false);
      expect(result.timeDisplay).toBe('Varies');
    });
  });

  describe('ISO string coercion (client-side JSON)', () => {
    // Firebase callable functions serialize Date objects to ISO strings.
    // All domain helpers must handle string dateTime values gracefully.

    const isoClass = {
      ...baseClass,
      sessions: [{ dateTime: '2030-06-15T14:00:00.000Z' as unknown as Date }],
    };

    const isoMultiSession = {
      ...baseClass,
      sessions: [
        { dateTime: '2030-06-29T14:00:00.000Z' as unknown as Date },
        { dateTime: '2030-06-15T14:00:00.000Z' as unknown as Date },
        { dateTime: '2030-06-22T14:00:00.000Z' as unknown as Date },
      ],
    };

    it('getFirstSession handles ISO strings', () => {
      const first = getFirstSession(isoClass);
      expect(first.dateTime).toBe('2030-06-15T14:00:00.000Z');
    });

    it('getSortedSessions handles ISO strings', () => {
      const sorted = getSortedSessions(isoMultiSession);
      expect(sorted.map((s) => String(s.dateTime))).toEqual([
        '2030-06-15T14:00:00.000Z',
        '2030-06-22T14:00:00.000Z',
        '2030-06-29T14:00:00.000Z',
      ]);
    });

    it('getRegistrationCutoff handles ISO string sessions', () => {
      const cutoff = getRegistrationCutoff(isoClass);
      expect(cutoff).toEqual(new Date('2030-06-15T14:00:00.000Z'));
    });

    it('getRegistrationCutoff handles ISO string registrationClosesAt', () => {
      const withOverride = {
        ...isoClass,
        registrationClosesAt: '2030-06-10T00:00:00.000Z' as unknown as Date,
      };
      expect(getRegistrationCutoff(withOverride)).toEqual(new Date('2030-06-10T00:00:00.000Z'));
    });

    it('getSessionEndTime handles ISO string', () => {
      const session = { dateTime: '2030-06-15T14:00:00.000Z' as unknown as Date };
      const result = getSessionEndTime(session, 120);
      expect(result).toEqual(new Date('2030-06-15T16:00:00.000Z'));
    });

    it('formatSessions handles ISO strings', () => {
      const result = formatSessions(
        [
          { dateTime: '2030-06-15T18:00:00.000Z' as unknown as Date },
          { dateTime: '2030-06-22T18:00:00.000Z' as unknown as Date },
        ],
        'America/New_York'
      );
      expect(result.sharedTime).toBe(true);
      expect(result.dateDisplay).toContain('Jun 15');
      expect(result.dateDisplay).toContain('Jun 22');
    });
  });
});
