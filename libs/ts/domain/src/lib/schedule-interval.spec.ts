/**
 * Biweekly arrangements (legacy #837).
 *
 * What these guard is the *parity*: which weeks belong to this student. Katie
 * has two students alternating in one Tuesday hour, so a pattern that drifted
 * by a week would put both of them in the room at once — and, once #81 is
 * charging cards, bill one of them for the other's lesson.
 *
 * The dangerous drift is not obvious: consecutive occurrences are 7 days apart
 * in calendar terms but 7 days ± 1 hour in elapsed milliseconds across a DST
 * boundary, so anything that divides raw time eventually rounds to the wrong
 * week.
 */
import { describe, it, expect } from 'vitest';
import { scheduleOccurrences } from './student-lesson-schedule';
import type { StudentLessonSchedule } from './student-lesson-schedule';

/** Elowen's real arrangement: Tuesdays 2pm, every other week, from 2026-09-30. */
function schedule(
  over: Partial<StudentLessonSchedule> = {}
): Pick<
  StudentLessonSchedule,
  'dayOfWeek' | 'startMinutes' | 'status' | 'startsOn' | 'endsOn' | 'intervalWeeks'
> {
  return {
    dayOfWeek: 2,
    startMinutes: 14 * 60,
    status: 'active',
    // Midday UTC on purpose: midnight UTC reads as the PREVIOUS day in the
    // shop zone, which walks the anchor back a week and silently flips which
    // weeks belong to this student. See the dedicated test below.
    startsOn: new Date('2026-09-30T12:00:00Z'),
    intervalWeeks: 2,
    ...over,
  };
}

const day = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

const clock = (d: Date) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);

describe('weekly is unchanged', () => {
  it('with no intervalWeeks at all', () => {
    const out = scheduleOccurrences(
      schedule({ intervalWeeks: undefined }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-10-31T12:00:00Z')
    );
    expect(out.map(day)).toEqual([
      '2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27',
    ]);
  });

  it('with an explicit 1', () => {
    const out = scheduleOccurrences(
      schedule({ intervalWeeks: 1 }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-10-31T12:00:00Z')
    );
    expect(out).toHaveLength(4);
  });
});

describe('biweekly', () => {
  it('reproduces Elowen’s real weeks exactly', () => {
    // Verified against production: 10-06, 10-20, 11-03, 11-17 are hers; the
    // weeks between are the ones Katie has been cancelling by hand.
    const out = scheduleOccurrences(
      schedule(),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-11-30T12:00:00Z')
    );
    expect(out.map(day)).toEqual([
      '2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17',
    ]);
  });

  it('anchors on startsOn even though startsOn is not the schedule weekday', () => {
    // 2026-09-30 is a Wednesday; the first Tuesday on or after it is 10-06,
    // and that is the week the alternation counts from.
    const out = scheduleOccurrences(
      schedule(),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-10-31T12:00:00Z')
    );
    expect(out.map(day)[0]).toBe('2026-10-06');
  });

  it('keeps the same weeks no matter where the query window starts', () => {
    // The materialisation horizon rolls forward every run. If parity were
    // relative to the window rather than to startsOn, a student's weeks would
    // flip each time the job ran.
    const wide = scheduleOccurrences(
      schedule(),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-12-31T12:00:00Z')
    ).map(day);

    for (const start of ['2026-10-07', '2026-10-14', '2026-10-21']) {
      const narrow = scheduleOccurrences(
        schedule(),
        new Date(`${start}T12:00:00Z`),
        new Date('2026-12-31T12:00:00Z')
      ).map(day);
      expect(narrow).toEqual(wide.filter((d) => d >= start));
    }
  });

  it('holds parity across the autumn DST change', () => {
    // EDT -> EST is 2026-11-01. Elapsed ms between consecutive Tuesdays either
    // side is 7 days + 1 hour, so raw-time arithmetic drifts here.
    const out = scheduleOccurrences(
      schedule(),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2027-01-15T12:00:00Z')
    );
    expect(out.map(day)).toEqual([
      '2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17',
      '2026-12-01', '2026-12-15', '2026-12-29', '2027-01-12',
    ]);
    // And the wall clock is still 2pm on both sides of the change.
    expect(out.every((o) => clock(o) === '2:00 PM')).toBe(true);
  });

  it('holds parity across the spring DST change', () => {
    // EST -> EDT is 2027-03-14.
    const out = scheduleOccurrences(
      schedule({ startsOn: new Date('2027-02-02T12:00:00Z') }),
      new Date('2027-02-01T12:00:00Z'),
      new Date('2027-04-15T12:00:00Z')
    );
    expect(out.map(day)).toEqual([
      '2027-02-02', '2027-02-16', '2027-03-02', '2027-03-16',
      '2027-03-30', '2027-04-13',
    ]);
    expect(out.every((o) => clock(o) === '2:00 PM')).toBe(true);
  });
});

describe('the startsOn instant is read in the shop zone', () => {
  it('reads a midnight-UTC startsOn as the previous shop day, shifting parity', () => {
    // Not a quirk to route around — it is the trap that would put two
    // alternating students in the room together. 2026-09-30T00:00Z is
    // 2026-09-29 8pm in ET, and 09-29 is itself a Tuesday, so the anchor
    // becomes that day and every one of this student's weeks moves.
    const shopDay = scheduleOccurrences(
      schedule({ startsOn: new Date('2026-09-30T12:00:00Z') }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-10-31T12:00:00Z')
    ).map(day);

    const utcMidnight = scheduleOccurrences(
      schedule({ startsOn: new Date('2026-09-30T00:00:00Z') }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-10-31T12:00:00Z')
    ).map(day);

    expect(shopDay).toEqual(['2026-10-06', '2026-10-20']);
    expect(utcMidnight).toEqual(['2026-10-13', '2026-10-27']);
    // Anything migrating existing arrangements has to check which of these it
    // is producing, per student, against their real lesson history.
    expect(shopDay).not.toEqual(utcMidnight);
  });
});

describe('two students alternating in one hour', () => {
  // Marisol and Odette share Tuesday 5pm. Their arrangements must interleave and
  // never coincide — the failure this feature exists to prevent.
  const odette = schedule({
    startMinutes: 17 * 60,
    startsOn: new Date('2026-09-08T12:00:00Z'),
  });
  const marisol = schedule({
    startMinutes: 17 * 60,
    startsOn: new Date('2026-09-15T12:00:00Z'),
  });

  it('never puts both students in the room on the same week', () => {
    const from = new Date('2026-09-01T12:00:00Z');
    const to = new Date('2027-03-31T12:00:00Z');

    const s = scheduleOccurrences(odette, from, to).map(day);
    const c = scheduleOccurrences(marisol, from, to).map(day);

    expect(s.filter((d) => c.includes(d))).toEqual([]);
  });

  it('interleaves them week by week, across a DST change', () => {
    const from = new Date('2026-09-01T12:00:00Z');
    const to = new Date('2026-12-31T12:00:00Z');

    const merged = [
      ...scheduleOccurrences(odette, from, to).map((d) => [day(d), 'Odette']),
      ...scheduleOccurrences(marisol, from, to).map((d) => [day(d), 'Marisol']),
    ].sort((a, b) => (a[0] < b[0] ? -1 : 1));

    expect(merged.slice(0, 8)).toEqual([
      ['2026-09-08', 'Odette'],
      ['2026-09-15', 'Marisol'],
      ['2026-09-22', 'Odette'],
      ['2026-09-29', 'Marisol'],
      ['2026-10-06', 'Odette'],
      ['2026-10-13', 'Marisol'],
      ['2026-10-20', 'Odette'],
      ['2026-10-27', 'Marisol'],
    ]);
  });
});

describe('bounds', () => {
  it('respects endsOn', () => {
    const out = scheduleOccurrences(
      schedule({ endsOn: new Date('2026-10-21T23:59:59Z') }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-12-31T12:00:00Z')
    );
    expect(out.map(day)).toEqual(['2026-10-06', '2026-10-20']);
  });

  it('yields nothing for an ended arrangement', () => {
    const out = scheduleOccurrences(
      schedule({ status: 'ended' }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-12-31T12:00:00Z')
    );
    expect(out).toEqual([]);
  });

  it('treats a fractional interval as its floor rather than misfiring', () => {
    const out = scheduleOccurrences(
      schedule({ intervalWeeks: 2.7 }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-11-30T12:00:00Z')
    );
    expect(out.map(day)).toEqual([
      '2026-10-06', '2026-10-20', '2026-11-03', '2026-11-17',
    ]);
  });

  it('supports a monthly-ish 4-week cadence', () => {
    const out = scheduleOccurrences(
      schedule({ intervalWeeks: 4 }),
      new Date('2026-10-01T12:00:00Z'),
      new Date('2026-12-31T12:00:00Z')
    );
    expect(out.map(day)).toEqual([
      '2026-10-06', '2026-11-03', '2026-12-01', '2026-12-29',
    ]);
  });
});
