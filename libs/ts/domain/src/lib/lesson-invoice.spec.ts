import { describe, expect, it } from 'vitest';
import {
  describeLessonLine,
  lessonInvoiceLines,
  lessonInvoiceTotalCents,
} from './lesson-invoice';

/** 7:00 PM ET on Mon 5 Oct 2026 — 11:00 PM UTC, so UTC has already rolled over. */
const EVENING = new Date('2026-10-06T00:30:00Z');

let seq = 0;
const nextId = () => `line-${++seq}`;

function lesson(over: Partial<{ id: string; scheduledAt: Date; durationMinutes: number }> = {}) {
  return {
    id: 'lesson-1',
    scheduledAt: new Date('2026-10-05T20:00:00Z'),
    durationMinutes: 30,
    ...over,
  };
}

describe('how a lesson reads on an invoice', () => {
  it('names the length and the day', () => {
    expect(describeLessonLine(lesson())).toBe('30-min lesson on Mon, Oct 5');
  });

  it('names the day in the shop timezone, not the machine’s', () => {
    // A late lesson is already "tomorrow" in UTC. The family is told the day
    // they turned up, which is the shop's day.
    expect(describeLessonLine(lesson({ scheduledAt: EVENING }))).toBe(
      '30-min lesson on Mon, Oct 5'
    );
  });
});

describe('turning a committed block into invoice lines', () => {
  it('prices each line with the resolver the card charge uses', () => {
    seq = 0;
    const lines = lessonInvoiceLines(
      [
        lesson({ id: 'l1' }),
        lesson({ id: 'l2', scheduledAt: new Date('2026-10-12T20:00:00Z') }),
      ],
      () => 3500,
      nextId
    );

    expect(lines).toEqual([
      {
        id: 'line-1',
        description: '30-min lesson on Mon, Oct 5',
        lessonId: 'l1',
        quantity: 1,
        unitAmountCents: 3500,
        subtotalCents: 3500,
      },
      {
        id: 'line-2',
        description: '30-min lesson on Mon, Oct 12',
        lessonId: 'l2',
        quantity: 1,
        unitAmountCents: 3500,
        subtotalCents: 3500,
      },
    ]);
  });

  it('carries the lesson id on every line, which is what stops a second bill', () => {
    // `invoicedLessonIds` reads this field; a line without it is invisible to
    // both charge paths and the family gets billed twice (#101).
    const lines = lessonInvoiceLines([lesson({ id: 'l9' })], () => 3000, nextId);
    expect(lines[0].lessonId).toBe('l9');
  });

  it('prices a longer lesson by its own rate, not the block average', () => {
    const lines = lessonInvoiceLines(
      [
        lesson({ id: 'l1', durationMinutes: 30 }),
        lesson({ id: 'l2', durationMinutes: 60 }),
      ],
      (l) => (l.durationMinutes >= 60 ? 6000 : 3000),
      nextId
    );
    expect(lines.map((l) => l.subtotalCents)).toEqual([3000, 6000]);
    expect(lessonInvoiceTotalCents(lines)).toBe(9000);
  });

  it('totals nothing for an empty block rather than throwing', () => {
    expect(lessonInvoiceTotalCents(lessonInvoiceLines([], () => 3000, nextId))).toBe(0);
  });
});
