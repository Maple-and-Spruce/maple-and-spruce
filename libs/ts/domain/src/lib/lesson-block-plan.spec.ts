/**
 * Deriving a block from what is being scheduled (legacy #835).
 *
 * The thing these guard is not "does the maths work" — it is that a derived
 * block never claims more availability than the thing it came from. A block is
 * what `get-my-week` reads as a teacher's standing week, so a one-off makeup
 * lesson that mints a weekly block is a lie about when Nathan works.
 */
import { describe, it, expect } from 'vitest';
import {
  BLOCK_EXTEND_WINDOW_MINUTES,
  planBlockAttribution,
} from './lesson-block';
import type { LessonBlock } from './lesson-block';

const TEACHER = 'teacher-1';

/** Tuesdays 4:00–5:00 pm ET. */
function block(overrides: Partial<LessonBlock> = {}): LessonBlock {
  return {
    id: 'blk-tue-pm',
    teacherId: TEACHER,
    dayOfWeek: 2,
    startMinutes: 16 * 60,
    endMinutes: 17 * 60,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** A Tuesday in ET summer (EDT, UTC-4). 2026-06-02 is a Tuesday. */
function tuesdayAt(hour: number, minute = 0): Date {
  return new Date(
    Date.UTC(2026, 5, 2, hour + 4, minute) // ET -> UTC in June
  );
}

const target = (over: Partial<Parameters<typeof planBlockAttribution>[1]> = {}) => ({
  teacherId: TEACHER,
  scheduledAt: tuesdayAt(16),
  durationMinutes: 30,
  recurring: true,
  ...over,
});

describe('planBlockAttribution — nothing to decide', () => {
  it('reports the block that already covers the slot', () => {
    const plan = planBlockAttribution([block()], target());

    expect(plan.fits?.id).toBe('blk-tue-pm');
    expect(plan.extensions).toEqual([]);
    expect(plan.draft).toBeUndefined();
  });

  it('ignores another teacher’s block entirely', () => {
    const plan = planBlockAttribution(
      [block({ teacherId: 'someone-else' })],
      target()
    );

    expect(plan.fits).toBeUndefined();
    expect(plan.extensions).toEqual([]);
    expect(plan.draft).toBeDefined();
  });

  it('ignores a block on a different weekday', () => {
    const plan = planBlockAttribution([block({ dayOfWeek: 4 })], target());
    expect(plan.extensions).toEqual([]);
  });
});

describe('planBlockAttribution — what a derived block claims', () => {
  it('derives a RECURRING block for a standing arrangement', () => {
    // A weekly arrangement genuinely is weekly availability, so the derived
    // block may say so.
    const plan = planBlockAttribution([], target({ recurring: true }));

    expect(plan.draft).toEqual({
      teacherId: TEACHER,
      dayOfWeek: 2,
      startMinutes: 16 * 60,
      endMinutes: 16 * 60 + 30,
    });
    expect(plan.draft?.onDate).toBeUndefined();
  });

  it('derives a ONE-OFF block for a single lesson', () => {
    // The whole point: a makeup lesson must not add a standing weekly slot to
    // the teacher's week.
    const plan = planBlockAttribution([], target({ recurring: false }));

    expect(plan.draft?.onDate).toBe('2026-06-02');
    expect(plan.draft?.dayOfWeek).toBe(2);
  });

  it('sizes the derived block to exactly the lesson', () => {
    const plan = planBlockAttribution(
      [],
      target({ scheduledAt: tuesdayAt(9, 15), durationMinutes: 45 })
    );

    expect(plan.draft?.startMinutes).toBe(9 * 60 + 15);
    expect(plan.draft?.endMinutes).toBe(10 * 60);
  });
});

describe('planBlockAttribution — one-off blocks are not weekly', () => {
  it('does not offer a one-off block to a recurring arrangement', () => {
    // Attributing a weekly arrangement to a one-off block would leave every
    // week after the first unattributed.
    const oneOff = block({ id: 'blk-once', onDate: '2026-06-02' });

    const plan = planBlockAttribution(
      [oneOff],
      target({ scheduledAt: tuesdayAt(17), recurring: true })
    );

    expect(plan.extensions).toEqual([]);
    expect(plan.fits).toBeUndefined();
  });

  it('offers a one-off block to a lesson on that same date', () => {
    const oneOff = block({ id: 'blk-once', onDate: '2026-06-02' });

    const plan = planBlockAttribution(
      [oneOff],
      target({ scheduledAt: tuesdayAt(17), recurring: false })
    );

    expect(plan.extensions.map((e) => e.block.id)).toEqual(['blk-once']);
  });

  it('ignores a one-off block on a different date, same weekday', () => {
    const oneOff = block({ id: 'blk-once', onDate: '2026-06-09' });

    const plan = planBlockAttribution(
      [oneOff],
      target({ scheduledAt: tuesdayAt(17), recurring: false })
    );

    expect(plan.extensions).toEqual([]);
  });
});

describe('planBlockAttribution — extending', () => {
  it('offers to extend a block the lesson runs past', () => {
    // 5:00–5:30 against a 4:00–5:00 block: the commonest real case.
    const plan = planBlockAttribution(
      [block()],
      target({ scheduledAt: tuesdayAt(17) })
    );

    expect(plan.extensions).toHaveLength(1);
    expect(plan.extensions[0]).toMatchObject({
      startMinutes: 16 * 60,
      endMinutes: 17 * 60 + 30,
      addedMinutes: 30,
      gapMinutes: 0,
    });
  });

  it('offers to extend backwards for a lesson before the block', () => {
    const plan = planBlockAttribution(
      [block()],
      target({ scheduledAt: tuesdayAt(15, 30) })
    );

    expect(plan.extensions[0]).toMatchObject({
      startMinutes: 15 * 60 + 30,
      endMinutes: 17 * 60,
      gapMinutes: 0,
    });
  });

  it('treats a lesson overlapping the block edge as adjacent', () => {
    // 4:45–5:45 starts inside a 4:00–5:00 block and ends past it.
    const plan = planBlockAttribution(
      [block()],
      target({ scheduledAt: tuesdayAt(16, 45), durationMinutes: 60 })
    );

    expect(plan.extensions[0].gapMinutes).toBe(0);
    expect(plan.extensions[0].endMinutes).toBe(17 * 60 + 45);
  });

  it(`offers a block exactly ${BLOCK_EXTEND_WINDOW_MINUTES} minutes away`, () => {
    const plan = planBlockAttribution(
      [block()],
      target({ scheduledAt: tuesdayAt(18) })
    );

    expect(plan.extensions).toHaveLength(1);
    expect(plan.extensions[0].gapMinutes).toBe(60);
  });

  it('does not offer a block further than that', () => {
    // 6:01 pm — one minute past the window. Katie gets a new block instead of
    // a block quietly stretched across an hour of time nobody teaches.
    const plan = planBlockAttribution(
      [block()],
      target({ scheduledAt: tuesdayAt(18, 1) })
    );

    expect(plan.extensions).toEqual([]);
    expect(plan.draft).toBeDefined();
  });

  it('puts the smallest widening first', () => {
    const near = block({
      id: 'blk-near',
      startMinutes: 17 * 60 + 45,
      endMinutes: 18 * 60 + 15,
    }); // 5:45–6:15
    const far = block({ id: 'blk-far' }); // 4:00–5:00

    // Lesson 5:30–6:00 abuts `near` (widen by 15) and trails `far` by 30
    // minutes (widen by 60).
    const plan = planBlockAttribution(
      [far, near],
      target({ scheduledAt: tuesdayAt(17, 30) })
    );

    expect(plan.extensions.map((e) => e.block.id)).toEqual([
      'blk-near',
      'blk-far',
    ]);
    expect(plan.extensions[0].addedMinutes).toBe(15);
    expect(plan.extensions[1].addedMinutes).toBe(60);
  });
});

describe('planBlockAttribution — what cannot be represented', () => {
  it('refuses a lesson running past midnight instead of writing a bad block', () => {
    // A block is a window inside one day. An endMinutes past 1440 would be a
    // block nothing could ever fit again.
    const plan = planBlockAttribution(
      [],
      target({ scheduledAt: tuesdayAt(23, 45), durationMinutes: 30 })
    );

    expect(plan.draft).toBeUndefined();
    expect(plan.extensions).toEqual([]);
    expect(plan.blocked).toMatch(/past midnight/i);
  });

  it('allows a lesson ending exactly at midnight', () => {
    const plan = planBlockAttribution(
      [],
      target({ scheduledAt: tuesdayAt(23, 30), durationMinutes: 30 })
    );

    expect(plan.blocked).toBeUndefined();
    expect(plan.draft?.endMinutes).toBe(24 * 60);
  });

  it('refuses an invalid date rather than deriving nonsense', () => {
    const plan = planBlockAttribution(
      [],
      target({ scheduledAt: new Date('nope') })
    );

    expect(plan.blocked).toBeTruthy();
    expect(plan.draft).toBeUndefined();
  });
});
