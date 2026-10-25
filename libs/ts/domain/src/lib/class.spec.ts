import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  asPublishable,
  toPublicClass,
  formatClassPrice,
  isClassRegistrationOpen,
  hasAvailableSpots,
  getSessionEndTime,
  getFirstSession,
  getSortedSessions,
  getRegistrationCutoff,
  formatSessions,
  getClassFormat,
  isPrivateHoursClass,
  buildPrivateHourSessions,
  getSessionStartTimes,
  sessionsOverlap,
  getBookableCapacity,
  isPrivateHourBookable,
  groupPrivateHoursByDay,
  formatPrivateHour,
  lineItemName,
  oneSessionPerDay,
  countOpenPrivateHours,
  buildPrivateHourRoster,
  formatPrivateHourStart,
  type Class,
  type ClassSession,
  type PublishableClass,
} from './class';

describe('Class domain helpers', () => {
  const baseClass: PublishableClass = {
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

  const multiSessionClass: PublishableClass = {
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

  });

  describe('asPublishable', () => {
    it('returns the class as PublishableClass when it has at least one session', () => {
      const result = asPublishable(baseClass);
      expect(result).not.toBeNull();
      expect(result?.sessions[0].dateTime).toEqual(
        new Date('2030-06-15T14:00:00Z')
      );
    });

    it('returns null for a class with no sessions', () => {
      const empty: Class = { ...baseClass, sessions: [] };
      expect(asPublishable(empty)).toBeNull();
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
      const withOverride: PublishableClass = {
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

    it('falls back to the name-derived slug when webflowSlug is absent', () => {
      expect(toPublicClass(baseClass).slug).toBe('introduction-to-weaving');
    });

    it('prefers the real Webflow slug over the name-derived one', () => {
      // Webflow auto-suffixes collisions, so the stored slug is not derivable
      // from the name — the public URL must use it verbatim.
      const result = toPublicClass({
        ...baseClass,
        webflowSlug: 'introduction-to-weaving-b192d',
      });
      expect(result.slug).toBe('introduction-to-weaving-b192d');
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
      // Month + day are joined with a non-breaking space so "Jun 15" never
      // wraps across lines in a comma-separated list of dates.
      expect(result.dateDisplay).toContain('Jun 15');
      expect(result.dateDisplay).toContain('Jun 22');
      expect(result.dateDisplay).not.toContain('Jun 15');
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

    const isoClass: PublishableClass = {
      ...baseClass,
      sessions: [{ dateTime: '2030-06-15T14:00:00.000Z' as unknown as Date }],
    };

    const isoMultiSession: PublishableClass = {
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
      expect(result.dateDisplay).toContain('Jun 15');
      expect(result.dateDisplay).toContain('Jun 22');
    });
  });

  describe('class format', () => {
    it('reads a missing format as seats', () => {
      expect(getClassFormat({})).toBe('seats');
      expect(isPrivateHoursClass({})).toBe(false);
    });

    it('recognises a private-hours class', () => {
      expect(getClassFormat({ format: 'privateHours' })).toBe('privateHours');
      expect(isPrivateHoursClass({ format: 'privateHours' })).toBe(true);
    });

    it('stays open while any hour is still ahead, even after the first has passed', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-15T15:30:00Z'));
      const privateHours: Class = {
        ...baseClass,
        format: 'privateHours',
        status: 'published',
        sessions: [
          { dateTime: new Date('2025-06-15T15:00:00Z') },
          { dateTime: new Date('2025-06-15T17:00:00Z') },
        ],
      };
      expect(isClassRegistrationOpen(privateHours)).toBe(true);
      vi.setSystemTime(new Date('2025-06-15T17:30:00Z'));
      expect(isClassRegistrationOpen(privateHours)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe('buildPrivateHourSessions', () => {
    const day1 = new Date(2030, 11, 5);
    const day2 = new Date(2030, 11, 12);

    it('makes one session per start time on every date, earliest first', () => {
      const sessions = buildPrivateHourSessions(
        [day2, day1],
        [
          { hours: 13, minutes: 0 },
          { hours: 10, minutes: 0 },
        ]
      );
      expect(sessions.map((s) => s.dateTime)).toEqual([
        new Date(2030, 11, 5, 10, 0),
        new Date(2030, 11, 5, 13, 0),
        new Date(2030, 11, 12, 10, 0),
        new Date(2030, 11, 12, 13, 0),
      ]);
    });

    it('keeps a repeated start time once', () => {
      const sessions = buildPrivateHourSessions(
        [day1],
        [
          { hours: 10, minutes: 0 },
          { hours: 10, minutes: 0 },
        ]
      );
      expect(sessions).toHaveLength(1);
    });

    it('returns no sessions without dates or start times', () => {
      expect(buildPrivateHourSessions([], [{ hours: 10, minutes: 0 }])).toEqual([]);
      expect(buildPrivateHourSessions([day1], [])).toEqual([]);
    });

    it('round-trips through getSessionStartTimes', () => {
      const times = [
        { hours: 10, minutes: 0 },
        { hours: 11, minutes: 30 },
        { hours: 14, minutes: 30 },
      ];
      const sessions = buildPrivateHourSessions([day1, day2], times);
      expect(getSessionStartTimes(sessions)).toEqual(times);
    });
  });

  describe('sessionsOverlap', () => {
    const at = (h: number, m = 0) => ({ dateTime: new Date(2030, 11, 5, h, m) });

    it('is false when each session ends before the next starts', () => {
      expect(sessionsOverlap([at(10), at(11, 30), at(13)], 60)).toBe(false);
    });

    it('allows back-to-back sessions', () => {
      expect(sessionsOverlap([at(10), at(11)], 60)).toBe(false);
    });

    it('is true when a session starts before the previous one ends', () => {
      expect(sessionsOverlap([at(13), at(10), at(10, 30)], 60)).toBe(true);
    });
  });

  describe('booking private hours', () => {
    // Sat Dec 7 2030: 10:00, 11:30 and 1:00 ET (EST is UTC-5).
    const ten = '2030-12-07T15:00:00.000Z';
    const eleven30 = '2030-12-07T16:30:00.000Z';
    const one = '2030-12-07T18:00:00.000Z';
    const nextSat = '2030-12-14T15:00:00.000Z';
    const hoursClass: Class = {
      ...baseClass,
      format: 'privateHours',
      durationMinutes: 60,
      capacity: 12,
      priceCents: 6000,
      sessions: [ten, eleven30, one, nextSat].map((d) => ({ dateTime: new Date(d) })),
    };
    const before = new Date('2030-12-01T00:00:00Z');

    it('sells hours, not seats', () => {
      expect(getBookableCapacity(hoursClass)).toBe(4);
      expect(getBookableCapacity({ ...hoursClass, format: 'seats' })).toBe(12);
    });

    it('books only a real, future hour of a private-hours class', () => {
      expect(isPrivateHourBookable(hoursClass, new Date(one), before)).toBe(true);
      expect(isPrivateHourBookable(hoursClass, new Date('2030-12-07T19:00:00Z'), before)).toBe(false);
      expect(isPrivateHourBookable(hoursClass, new Date(ten), new Date(ten))).toBe(false);
      expect(isPrivateHourBookable({ ...hoursClass, format: 'seats' }, new Date(one), before)).toBe(false);
    });

    it('groups future hours by studio day and marks the booked ones', () => {
      const days = groupPrivateHoursByDay(hoursClass.sessions, 60, [new Date(one)], before);
      expect(days.map((d) => [d.key, d.label, d.openCount])).toEqual([
        ['2030-12-07', 'Sat, Dec 7', 2],
        ['2030-12-14', 'Sat, Dec 14', 1],
      ]);
      expect(days[0].hours).toEqual([
        { start: ten, label: '10:00–11:00 AM', booked: false },
        { start: eleven30, label: '11:30 AM–12:30 PM', booked: false },
        { start: one, label: '1:00–2:00 PM', booked: true },
      ]);
    });

    it('leaves out hours that have already started', () => {
      const days = groupPrivateHoursByDay(hoursClass.sessions, 60, [], new Date(eleven30));
      expect(days[0].hours.map((h) => h.start)).toEqual([one]);
    });

    it('names the hour on receipts and emails', () => {
      expect(formatPrivateHour(eleven30, 60)).toBe('Sat, Dec 7, 11:30 AM–12:30 PM');
      expect(lineItemName(hoursClass, one)).toBe(`${baseClass.name}, Sat, Dec 7, 1:00–2:00 PM`);
      expect(lineItemName({ ...hoursClass, format: 'seats' }, one)).toBe(baseClass.name);
      expect(lineItemName(hoursClass)).toBe(baseClass.name);
    });

    it('lists each day once', () => {
      expect(oneSessionPerDay(hoursClass.sessions).map((s) => s.dateTime.toISOString())).toEqual([
        ten,
        nextSat,
      ]);
    });

    it('counts only hours still ahead as open', () => {
      expect(countOpenPrivateHours(hoursClass, [new Date(one)], new Date(eleven30))).toBe(1);
      expect(countOpenPrivateHours(hoursClass, [], before)).toBe(4);
    });

    it('tells the public which hours are taken and how many are open', () => {
      const pc = toPublicClass(hoursClass, undefined, undefined, 1, [new Date(one)]);
      expect(pc.format).toBe('privateHours');
      expect(pc.bookedSlotStarts).toEqual([one]);
      expect(pc.spotsRemaining).toBe(3);
      const seats = toPublicClass({ ...hoursClass, format: undefined }, undefined, undefined, 1);
      expect(seats.format).toBeUndefined();
      expect(seats.bookedSlotStarts).toBeUndefined();
      expect(seats.spotsRemaining).toBe(11);
    });
  });

  describe('private-hours roster', () => {
    const hours = [
      '2030-12-07T15:00:00.000Z',
      '2030-12-07T16:30:00.000Z',
      '2030-12-14T15:00:00.000Z',
    ];
    const cls = {
      sessions: hours.map((d) => ({ dateTime: new Date(d) })),
      durationMinutes: 60,
    };
    const reg = (slotStart: string, status: string, name: string) => ({
      slotStart: new Date(slotStart),
      status,
      customerName: name,
    });

    it('lists every hour by day with the group holding it', () => {
      const days = buildPrivateHourRoster(cls, [
        reg(hours[1], 'confirmed', 'Robin Ashfield'),
        reg(hours[2], 'pending', 'Olive Thompson'),
      ]);
      expect(days.map((d) => [d.label, d.bookedCount, d.hours.length])).toEqual([
        ['Sat, Dec 7', 1, 2],
        ['Sat, Dec 14', 1, 1],
      ]);
      expect(days[0].hours[0].registration).toBeUndefined();
      expect(days[0].hours[1].registration?.customerName).toBe('Robin Ashfield');
      expect(days[1].hours[0].registration?.customerName).toBe('Olive Thompson');
    });

    it('frees an hour whose booking was cancelled or refunded', () => {
      const days = buildPrivateHourRoster(cls, [
        reg(hours[0], 'cancelled', 'Robin Ashfield'),
        reg(hours[1], 'refunded', 'Olive Thompson'),
      ]);
      expect(days[0].bookedCount).toBe(0);
    });

    it('keeps past hours on the roster', () => {
      const past = { ...cls, sessions: [{ dateTime: new Date('2020-01-04T15:00:00Z') }] };
      expect(buildPrivateHourRoster(past, [])[0].hours).toHaveLength(1);
    });

    it('names an hour by its start in studio time', () => {
      expect(formatPrivateHourStart(hours[1])).toBe('Sat, Dec 7, 11:30 AM');
    });
  });
});
