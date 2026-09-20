/**
 * The day column (legacy #838).
 *
 * These are written against Katie's real Tuesday, because the whole point of
 * the view is to replace the spreadsheet she keeps by hand — so if it cannot
 * reproduce that day, it is not a replacement.
 *
 * The interesting assertions are all about **partly free** hours. A weekly view
 * that only knows busy/free cannot tell the difference between an hour holding
 * one biweekly student (half sellable, and only to another biweekly student)
 * and an hour holding two interleaved ones (not sellable at all). Katie's sheet
 * makes that distinction; so must this.
 */
import { describe, it, expect } from 'vitest';
import { buildDayColumn } from './day-column';
import type { DayColumnOpenRow, DayColumnLessonRow } from './day-column';
import type { LessonBlock } from './lesson-block';
import type { StudentLessonSchedule } from './student-lesson-schedule';

const TEACHER = 'teacher-katie';
/** A Tuesday, midday UTC so it reads as that date in shop time. */
const FROM = new Date('2026-09-08T12:00:00Z');

/** Tuesdays 11:00–18:30, the shape of Katie's real teaching day. */
const block: LessonBlock = {
  id: 'blk-tue',
  teacherId: TEACHER,
  dayOfWeek: 2,
  startMinutes: 11 * 60,
  endMinutes: 18 * 60 + 30,
  createdAt: new Date(),
  updatedAt: new Date(),
};

let seq = 0;
function slot(
  over: Partial<StudentLessonSchedule> & {
    startMinutes: number;
    durationMinutes: number;
  }
): StudentLessonSchedule {
  return {
    id: `sched-${++seq}`,
    studentId: `student-${seq}`,
    teacherId: TEACHER,
    blockId: 'blk-tue',
    dayOfWeek: 2,
    status: 'active',
    startsOn: FROM,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as StudentLessonSchedule;
}

const opens = (rows: ReturnType<typeof buildDayColumn>) =>
  rows.filter((r): r is DayColumnOpenRow => r.kind === 'open');
const lessons = (rows: ReturnType<typeof buildDayColumn>) =>
  rows.filter((r): r is DayColumnLessonRow => r.kind === 'lesson');

describe('order', () => {
  it('lays the day out top to bottom in time order', () => {
    const rows = buildDayColumn(
      2,
      [block],
      [
        slot({ startMinutes: 12 * 60, durationMinutes: 60 }),
        slot({ startMinutes: 11 * 60, durationMinutes: 60 }),
      ],
      { from: FROM }
    );

    const starts = rows.map((r) => r.startMinutes);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('puts the lesson above the opening that shares its start', () => {
    // A biweekly student and the alternate week of their own hour.
    const rows = buildDayColumn(
      2,
      [block],
      [slot({ startMinutes: 11 * 60, durationMinutes: 60, intervalWeeks: 2 })],
      { from: FROM }
    );

    const atEleven = rows.filter((r) => r.startMinutes === 11 * 60);
    expect(atEleven.map((r) => r.kind)).toEqual(['lesson', 'open']);
  });
});

describe('an hour is not simply busy or free', () => {
  it('shows a biweekly student’s hour as free every other week', () => {
    // Pip, 11-12, biweekly. Katie's sheet has "biweekly open slot 11-12"
    // directly underneath, and it is sellable to exactly one more student.
    const rows = buildDayColumn(
      2,
      [block],
      [slot({ startMinutes: 11 * 60, durationMinutes: 60, intervalWeeks: 2 })],
      { from: FROM }
    );

    const opening = opens(rows).find((r) => r.startMinutes === 11 * 60);
    expect(opening).toBeDefined();
    expect(opening?.everyWeeks).toBe(2);
    expect(opening?.endMinutes).toBe(12 * 60);
    expect(opening?.irregular).toBe(false);
  });

  it('shows a weekly student’s hour as not free at all', () => {
    const rows = buildDayColumn(
      2,
      [block],
      [slot({ startMinutes: 12 * 60, durationMinutes: 60 })],
      { from: FROM }
    );

    expect(opens(rows).some((r) => r.startMinutes === 12 * 60)).toBe(false);
  });

  it('shows two interleaved biweekly students as not free at all', () => {
    // Marisol and Odette share Tuesday 5pm on alternate weeks. A typical-week
    // view cannot tell this apart from a single biweekly student — this is
    // the case that would sell an hour twice.
    const rows = buildDayColumn(
      2,
      [block],
      [
        slot({
          startMinutes: 17 * 60,
          durationMinutes: 60,
          intervalWeeks: 2,
          startsOn: FROM,
        }),
        slot({
          startMinutes: 17 * 60,
          durationMinutes: 60,
          intervalWeeks: 2,
          startsOn: new Date('2026-09-15T12:00:00Z'), // the alternate week
        }),
      ],
      { from: FROM }
    );

    expect(lessons(rows).filter((r) => r.startMinutes === 17 * 60)).toHaveLength(2);
    expect(opens(rows).some((r) => r.startMinutes === 17 * 60)).toBe(false);
  });

  it('still offers the leftover week when two biweekly students land on the SAME week', () => {
    // Both anchored to the same week, so the other week is genuinely free —
    // even though the slot is double-booked on their shared week, which is
    // legacy #841's problem, not this view's.
    const rows = buildDayColumn(
      2,
      [block],
      [
        slot({ startMinutes: 17 * 60, durationMinutes: 60, intervalWeeks: 2 }),
        slot({ startMinutes: 17 * 60, durationMinutes: 60, intervalWeeks: 2 }),
      ],
      { from: FROM }
    );

    expect(opens(rows).find((r) => r.startMinutes === 17 * 60)?.everyWeeks).toBe(2);
  });
});

describe('openings between lessons', () => {
  it('offers the gap between two lessons, every week', () => {
    const rows = buildDayColumn(
      2,
      [block],
      [
        slot({ startMinutes: 11 * 60, durationMinutes: 60 }),
        slot({ startMinutes: 14 * 60, durationMinutes: 60 }),
      ],
      { from: FROM }
    );

    const gap = opens(rows).find((r) => r.startMinutes === 12 * 60);
    expect(gap).toBeDefined();
    expect(gap?.endMinutes).toBe(14 * 60);
    expect(gap?.everyWeeks).toBe(1);
    expect(gap?.fitsDurations).toContain(60);
  });

  it('merges adjacent free stretches into one opening', () => {
    // Two lessons leave 12:00-13:00 and 13:00-14:00 free; splitting those at a
    // boundary nobody can see would read as two openings.
    const rows = buildDayColumn(
      2,
      [block],
      [
        slot({ startMinutes: 11 * 60, durationMinutes: 60 }),
        slot({ startMinutes: 14 * 60, durationMinutes: 30 }),
      ],
      { from: FROM }
    );

    const between = opens(rows).filter(
      (r) => r.startMinutes >= 12 * 60 && r.endMinutes <= 14 * 60
    );
    expect(between).toHaveLength(1);
    expect(between[0]).toMatchObject({
      startMinutes: 12 * 60,
      endMinutes: 14 * 60,
    });
  });

  it('does not merge across a change in which weeks are free', () => {
    // 11-12 is free every other week (behind a biweekly student); 12-13 is
    // free every week. Merging them would advertise the whole two hours as
    // weekly and sell a slot that is not there.
    const rows = buildDayColumn(
      2,
      [block],
      [slot({ startMinutes: 11 * 60, durationMinutes: 60, intervalWeeks: 2 })],
      { from: FROM }
    );

    const early = opens(rows).find((r) => r.startMinutes === 11 * 60);
    expect(early?.endMinutes).toBe(12 * 60);
    expect(early?.everyWeeks).toBe(2);
  });

  it('drops a sliver too short to sell', () => {
    const rows = buildDayColumn(
      2,
      [{ ...block, startMinutes: 11 * 60, endMinutes: 12 * 60 + 15 }],
      [slot({ startMinutes: 11 * 60, durationMinutes: 60 })],
      { from: FROM }
    );

    expect(opens(rows)).toEqual([]);
  });
});

describe('scope', () => {
  it('ignores another weekday entirely', () => {
    const rows = buildDayColumn(
      2,
      [{ ...block, dayOfWeek: 4 }],
      [slot({ startMinutes: 11 * 60, durationMinutes: 60, dayOfWeek: 4 })],
      { from: FROM }
    );
    expect(rows).toEqual([]);
  });

  it('scopes to one teacher when asked', () => {
    const other = { ...block, id: 'blk-other', teacherId: 'teacher-nathan' };
    const rows = buildDayColumn(
      2,
      [block, other],
      [
        slot({ startMinutes: 11 * 60, durationMinutes: 60 }),
        slot({
          startMinutes: 13 * 60,
          durationMinutes: 60,
          teacherId: 'teacher-nathan',
          blockId: 'blk-other',
        }),
      ],
      { from: FROM, teacherId: TEACHER }
    );

    expect(lessons(rows)).toHaveLength(1);
    expect(lessons(rows)[0].teacherId).toBe(TEACHER);
  });

  it('leaves a one-off block out of the typical week', () => {
    // A block scoped to a single date (legacy #835) is an exception, not availability.
    const rows = buildDayColumn(
      2,
      [{ ...block, id: 'blk-once', onDate: '2026-09-08' }],
      [],
      { from: FROM }
    );
    expect(rows).toEqual([]);
  });

  it('ignores an ended arrangement', () => {
    const rows = buildDayColumn(
      2,
      [block],
      [slot({ startMinutes: 11 * 60, durationMinutes: 60, status: 'ended' })],
      { from: FROM }
    );
    expect(lessons(rows)).toEqual([]);
  });

  it('offers the whole block when nobody is booked', () => {
    const rows = buildDayColumn(2, [block], [], { from: FROM });

    expect(opens(rows)).toHaveLength(1);
    expect(opens(rows)[0]).toMatchObject({
      startMinutes: 11 * 60,
      endMinutes: 18 * 60 + 30,
      everyWeeks: 1,
    });
  });

  it('offers nothing outside a block, even with no lessons', () => {
    const rows = buildDayColumn(2, [], [], { from: FROM });
    expect(rows).toEqual([]);
  });
});

describe('Katie’s real Tuesday', () => {
  it('reproduces the sequence from her spreadsheet', () => {
    const rows = buildDayColumn(
      2,
      [block],
      [
        slot({ startMinutes: 11 * 60, durationMinutes: 60, intervalWeeks: 2 }), // Pip
        slot({ startMinutes: 12 * 60, durationMinutes: 60 }), // Tobias
        slot({ startMinutes: 14 * 60, durationMinutes: 60, intervalWeeks: 2 }), // Elowen
        slot({ startMinutes: 15 * 60, durationMinutes: 60 }), // Delphine
        slot({
          startMinutes: 17 * 60,
          durationMinutes: 60,
          intervalWeeks: 2,
        }), // Marisol
        slot({
          startMinutes: 17 * 60,
          durationMinutes: 60,
          intervalWeeks: 2,
          startsOn: new Date('2026-09-15T12:00:00Z'),
        }), // Odette, alternate week
        slot({ startMinutes: 18 * 60, durationMinutes: 30 }), // Devin
      ],
      { from: FROM }
    );

    const shape = rows.map((r) =>
      r.kind === 'lesson'
        ? `lesson ${r.startMinutes / 60}`
        : `open/${r.everyWeeks} ${r.startMinutes / 60}`
    );

    expect(shape).toEqual([
      'lesson 11', // Pip, biweekly
      'open/2 11', // his alternate week — sellable to one more biweekly student
      'lesson 12', // Tobias, weekly
      'open/1 13', // the 1-2 gap, free every week
      'lesson 14', // Elowen, biweekly
      'open/2 14', // her alternate week
      'lesson 15', // Delphine, weekly
      'open/1 16', // the 4-5 gap
      'lesson 17', // Marisol
      'lesson 17', // Odette — same hour, alternate weeks, so NO opening
      'lesson 18', // Devin, 30 minutes
    ]);
  });
});
