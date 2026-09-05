import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SCHEDULE_HORIZON_WEEKS,
  isScheduleActiveOn,
  materializedLessonId,
  scheduleHorizonEnd,
  scheduleOccurrences,
  zonedDateKey,
  zonedWallClockToInstant,
} from './student-lesson-schedule';
import type { StudentLessonSchedule } from './student-lesson-schedule';
import { minutesOfDayInZone, weekdayIndexInZone } from './schedule-format';

const ET = 'America/New_York';

/** Tuesdays at 4:00pm ET, 30 minutes, open-ended from 2026-01-01. */
function schedule(
  overrides: Partial<StudentLessonSchedule> = {}
): Pick<
  StudentLessonSchedule,
  'dayOfWeek' | 'startMinutes' | 'status' | 'startsOn' | 'endsOn'
> {
  return {
    dayOfWeek: 2,
    startMinutes: 16 * 60,
    status: 'active',
    startsOn: new Date('2026-01-01T00:00:00Z'),
    endsOn: undefined,
    ...overrides,
  };
}

describe('zonedWallClockToInstant', () => {
  it('resolves a summer wall clock at the daylight offset', () => {
    // 2026-07-07 is EDT (UTC-4), so 4:00pm ET is 20:00Z.
    const instant = zonedWallClockToInstant(2026, 7, 7, 16 * 60, ET);
    expect(instant.toISOString()).toBe('2026-07-07T20:00:00.000Z');
  });

  it('resolves a winter wall clock at the standard offset', () => {
    // 2026-01-06 is EST (UTC-5), so the same 4:00pm ET is 21:00Z.
    const instant = zonedWallClockToInstant(2026, 1, 6, 16 * 60, ET);
    expect(instant.toISOString()).toBe('2026-01-06T21:00:00.000Z');
  });

  it('round-trips: the instant reads back as the wall clock asked for', () => {
    for (const [y, m, d] of [
      [2026, 3, 8], // spring-forward date
      [2026, 3, 9],
      [2026, 11, 1], // fall-back date
      [2026, 11, 2],
      [2026, 6, 15],
    ] as const) {
      const instant = zonedWallClockToInstant(y, m, d, 16 * 60, ET);
      expect(minutesOfDayInZone(instant, ET)).toBe(16 * 60);
    }
  });
});

describe('scheduleOccurrences — DST', () => {
  it('keeps a 4pm lesson at 4pm across the spring-forward boundary', () => {
    // 2026-03-08 is the US spring-forward date. A schedule that added a fixed
    // 7 x 24h would drift to 3pm for the rest of the year.
    const occurrences = scheduleOccurrences(
      schedule(),
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-25T23:59:59Z'),
      ET
    );

    expect(occurrences.length).toBeGreaterThanOrEqual(3);
    for (const occurrence of occurrences) {
      expect(minutesOfDayInZone(occurrence, ET)).toBe(16 * 60);
      expect(weekdayIndexInZone(occurrence, ET)).toBe(2);
    }
    // And the underlying instants really do differ side to side of the boundary.
    const isoTimes = new Set(
      occurrences.map((o) => o.toISOString().slice(11, 16))
    );
    expect(isoTimes.size).toBeGreaterThan(1);
  });

  it('keeps a 4pm lesson at 4pm across the fall-back boundary', () => {
    const occurrences = scheduleOccurrences(
      schedule(),
      new Date('2026-10-25T00:00:00Z'),
      new Date('2026-11-18T23:59:59Z'),
      ET
    );

    expect(occurrences.length).toBeGreaterThanOrEqual(3);
    for (const occurrence of occurrences) {
      expect(minutesOfDayInZone(occurrence, ET)).toBe(16 * 60);
      expect(weekdayIndexInZone(occurrence, ET)).toBe(2);
    }
  });
});

describe('scheduleOccurrences — window and lifecycle', () => {
  it('produces one occurrence per week', () => {
    const occurrences = scheduleOccurrences(
      schedule(),
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-06-30T23:59:59Z'),
      ET
    );
    expect(occurrences).toHaveLength(5); // Tuesdays in June 2026
  });

  it('never produces a duplicate instant', () => {
    const occurrences = scheduleOccurrences(
      schedule(),
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-08-31T23:59:59Z'),
      ET
    );
    const unique = new Set(occurrences.map((o) => o.getTime()));
    expect(unique.size).toBe(occurrences.length);
  });

  it('produces nothing before the arrangement starts', () => {
    const occurrences = scheduleOccurrences(
      schedule({ startsOn: new Date('2026-07-01T00:00:00Z') }),
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-06-30T23:59:59Z'),
      ET
    );
    expect(occurrences).toEqual([]);
  });

  it('stops at the end date', () => {
    const occurrences = scheduleOccurrences(
      schedule({ endsOn: new Date('2026-06-16T23:59:59Z') }),
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-06-30T23:59:59Z'),
      ET
    );
    expect(occurrences).toHaveLength(3); // Jun 2, 9, 16 — the 16th is inclusive
    expect(
      occurrences.every(
        (o) => o.getTime() <= new Date('2026-06-16T23:59:59Z').getTime()
      )
    ).toBe(true);
  });

  it('produces nothing for an ended arrangement', () => {
    // Ending a student's lessons has to actually end them.
    const occurrences = scheduleOccurrences(
      schedule({ status: 'ended' }),
      new Date('2026-06-01T00:00:00Z'),
      new Date('2026-06-30T23:59:59Z'),
      ET
    );
    expect(occurrences).toEqual([]);
  });

  it('returns nothing for an inverted window rather than looping', () => {
    expect(
      scheduleOccurrences(
        schedule(),
        new Date('2026-06-30T00:00:00Z'),
        new Date('2026-06-01T00:00:00Z'),
        ET
      )
    ).toEqual([]);
  });
});

describe('isScheduleActiveOn', () => {
  it('is false before it starts and after it ends', () => {
    const s = schedule({
      startsOn: new Date('2026-06-01T00:00:00Z'),
      endsOn: new Date('2026-06-30T00:00:00Z'),
    });
    expect(isScheduleActiveOn(s, new Date('2026-05-31T00:00:00Z'))).toBe(false);
    expect(isScheduleActiveOn(s, new Date('2026-06-15T00:00:00Z'))).toBe(true);
    expect(isScheduleActiveOn(s, new Date('2026-07-01T00:00:00Z'))).toBe(false);
  });

  it('is open-ended when there is no end date', () => {
    // Rolling enrollment is the normal case, not the exception.
    expect(
      isScheduleActiveOn(schedule(), new Date('2030-01-01T00:00:00Z'))
    ).toBe(true);
  });
});

describe('materializedLessonId', () => {
  it('is stable for the same arrangement and date', () => {
    const occurrence = zonedWallClockToInstant(2026, 7, 7, 16 * 60, ET);
    expect(materializedLessonId('sched-1', occurrence, ET)).toBe(
      'sched-sched-1-2026-07-07'
    );
  });

  it('keys on the shop-timezone date, not the UTC date', () => {
    // An 8:30pm ET lesson has already crossed midnight in UTC. Keying on the
    // UTC date would file a Monday lesson under Tuesday, and the id is the
    // only thing stopping a duplicate being materialised next run.
    const evening = zonedWallClockToInstant(2026, 7, 6, 20 * 60 + 30, ET);
    expect(evening.toISOString().startsWith('2026-07-07')).toBe(true);
    expect(materializedLessonId('s', evening, ET)).toBe('sched-s-2026-07-06');
  });

  it('differs per occurrence, so each week is its own lesson', () => {
    const a = zonedWallClockToInstant(2026, 7, 7, 16 * 60, ET);
    const b = zonedWallClockToInstant(2026, 7, 14, 16 * 60, ET);
    expect(materializedLessonId('s', a, ET)).not.toBe(
      materializedLessonId('s', b, ET)
    );
  });
});

describe('zonedDateKey', () => {
  it('reads the date in the shop timezone', () => {
    const lateEvening = new Date('2026-07-07T02:30:00Z'); // 10:30pm ET Jul 6
    expect(zonedDateKey(lateEvening, ET)).toBe('2026-07-06');
  });
});

describe('scheduleHorizonEnd', () => {
  it('defaults to the twelve-week horizon', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const end = scheduleHorizonEnd(now);
    const weeks = (end.getTime() - now.getTime()) / (7 * 86_400_000);
    expect(weeks).toBe(DEFAULT_SCHEDULE_HORIZON_WEEKS);
  });
});
