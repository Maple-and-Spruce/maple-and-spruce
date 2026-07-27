import { describe, it, expect } from 'vitest';
import {
  lessonFitsBlock,
  isLessonUnattributed,
  type LessonBlock,
} from './lesson-block';

// A block for Tuesdays 3:00–6:00 PM (ET), minutes-from-midnight.
const tuesdayAfternoon: LessonBlock = {
  id: 'block-tue',
  teacherId: 'instr-nathan',
  dayOfWeek: 2, // Tuesday
  startMinutes: 15 * 60, // 900 = 3:00 PM
  endMinutes: 18 * 60, // 1080 = 6:00 PM
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('lessonFitsBlock', () => {
  it('fits a lesson at 4:00 PM ET on a Tuesday (summer, EDT = UTC-4)', () => {
    // 2026-07-21 is a Tuesday; 20:00Z = 16:00 EDT.
    const at = new Date('2026-07-21T20:00:00Z');
    expect(lessonFitsBlock(at, 30, tuesdayAfternoon)).toBe(true);
  });

  it('fits the same wall-clock lesson in winter (EST = UTC-5)', () => {
    // 2026-01-20 is a Tuesday; 21:00Z = 16:00 EST — same ET wall clock, so the
    // DST offset must not change the verdict.
    const at = new Date('2026-01-20T21:00:00Z');
    expect(lessonFitsBlock(at, 30, tuesdayAfternoon)).toBe(true);
  });

  it('rejects a lesson whose end spills past the window', () => {
    // 17:30 ET + 60 min = 18:30 ET, past the 18:00 end.
    const at = new Date('2026-07-21T21:30:00Z'); // 17:30 EDT
    expect(lessonFitsBlock(at, 60, tuesdayAfternoon)).toBe(false);
  });

  it('rejects a lesson on the wrong weekday', () => {
    // 2026-07-20 is a Monday at 16:00 EDT.
    const at = new Date('2026-07-20T20:00:00Z');
    expect(lessonFitsBlock(at, 30, tuesdayAfternoon)).toBe(false);
  });

  it('rejects a lesson starting before the window', () => {
    const at = new Date('2026-07-21T18:30:00Z'); // 14:30 EDT
    expect(lessonFitsBlock(at, 30, tuesdayAfternoon)).toBe(false);
  });

  it('rejects an invalid date', () => {
    expect(lessonFitsBlock(new Date('nope'), 30, tuesdayAfternoon)).toBe(false);
  });
});

describe('isLessonUnattributed', () => {
  const at = new Date('2026-07-21T20:00:00Z'); // Tue 16:00 EDT
  const base = { teacherId: 'instr-nathan', scheduledAt: at, durationMinutes: 30 };

  it('is unattributed when there is no blockId', () => {
    expect(isLessonUnattributed({ ...base, blockId: null }, [tuesdayAfternoon])).toBe(true);
    expect(isLessonUnattributed({ ...base, blockId: undefined }, [tuesdayAfternoon])).toBe(true);
  });

  it('is unattributed when the block no longer exists', () => {
    expect(isLessonUnattributed({ ...base, blockId: 'gone' }, [tuesdayAfternoon])).toBe(true);
  });

  it('is unattributed when the block belongs to another teacher', () => {
    expect(
      isLessonUnattributed(
        { ...base, teacherId: 'instr-someone-else', blockId: 'block-tue' },
        [tuesdayAfternoon]
      )
    ).toBe(true);
  });

  it('is unattributed when the lesson no longer fits the (narrowed) block', () => {
    const narrowed: LessonBlock = { ...tuesdayAfternoon, startMinutes: 17 * 60 };
    expect(isLessonUnattributed({ ...base, blockId: 'block-tue' }, [narrowed])).toBe(true);
  });

  it('is attributed when the block exists, owns the teacher, and fits', () => {
    expect(isLessonUnattributed({ ...base, blockId: 'block-tue' }, [tuesdayAfternoon])).toBe(false);
  });
});
