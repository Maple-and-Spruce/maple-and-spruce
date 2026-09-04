import { describe, it, expect } from 'vitest';
import {
  isAwaitingHopeSubmission,
  isHopePaid,
  summarizeHopeQueue,
} from './hope-submission';
import type {
  HopeQueueEntry,
  HopeSubmission,
  HopeSubmissionStatus,
} from './hope-submission';
import type { Lesson } from './lesson';

const lesson = {
  id: 'lesson-1',
  studentId: 'student-1',
  scheduledAt: new Date('2026-08-01T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'teacher-1',
  status: 'rendered',
  createdAt: new Date(),
  updatedAt: new Date(),
} as Lesson;

function submission(
  status: HopeSubmissionStatus,
  rateCents = 4125
): HopeSubmission {
  return {
    id: 'lesson-1',
    lessonId: 'lesson-1',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    lessonDate: lesson.scheduledAt,
    status,
    rateCents,
    submittedAt: new Date('2026-08-05T00:00:00Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function entry(
  overrides: Partial<HopeQueueEntry> = {}
): HopeQueueEntry {
  return {
    lesson,
    studentId: 'student-1',
    studentName: 'Rowan',
    registeredLessonLength: '30-min-full',
    rateCents: 4125,
    ...overrides,
  };
}

describe('isAwaitingHopeSubmission', () => {
  it('is true when nothing has been claimed', () => {
    expect(isAwaitingHopeSubmission(entry())).toBe(true);
  });

  it('is true again after EMA rejects a claim', () => {
    // A rejection means the studio taught the lesson and still has not been
    // paid. Financially that is identical to never having claimed it, so the
    // lesson goes back in the queue rather than disappearing into a dead state.
    expect(
      isAwaitingHopeSubmission(entry({ submission: submission('rejected') }))
    ).toBe(true);
  });

  it.each(['submitted', 'paid'] as const)('is false once %s', (status) => {
    expect(
      isAwaitingHopeSubmission(entry({ submission: submission(status) }))
    ).toBe(false);
  });
});

describe('isHopePaid', () => {
  it.each([
    ['paid', true],
    ['submitted', false],
    ['rejected', false],
  ] as const)('%s -> %s', (status, expected) => {
    expect(isHopePaid(entry({ submission: submission(status) }))).toBe(expected);
  });

  it('is false when nothing has been claimed', () => {
    expect(isHopePaid(entry())).toBe(false);
  });
});

describe('summarizeHopeQueue', () => {
  it('answers "what have we taught and not been paid for"', () => {
    const totals = summarizeHopeQueue([
      entry(),
      entry({ rateCents: 5875 }),
      entry({ submission: submission('submitted') }),
      entry({ submission: submission('paid') }),
    ]);

    expect(totals.awaitingCount).toBe(2);
    expect(totals.awaitingCents).toBe(4125 + 5875);
    expect(totals.submittedCount).toBe(1);
    expect(totals.submittedCents).toBe(4125);
    expect(totals.paidCount).toBe(1);
    expect(totals.paidCents).toBe(4125);
  });

  it('counts a rejected claim as still owed, and flags it separately', () => {
    const totals = summarizeHopeQueue([
      entry({ submission: submission('rejected') }),
    ]);

    // Both, deliberately: it is money still owed AND it needs a different
    // action from a lesson that was never claimed.
    expect(totals.awaitingCount).toBe(1);
    expect(totals.awaitingCents).toBe(4125);
    expect(totals.rejectedCount).toBe(1);
    expect(totals.submittedCount).toBe(0);
  });

  it('reports what was actually claimed, not what it would be claimed at today', () => {
    // A rate change must not retroactively restate a submitted claim, or the
    // figure on screen stops matching what EMA was actually told.
    const totals = summarizeHopeQueue([
      entry({ rateCents: 9999, submission: submission('submitted', 4125) }),
    ]);

    expect(totals.submittedCents).toBe(4125);
  });

  it('prices an unclaimed lesson at today’s rate', () => {
    // Nothing has been stamped yet, so today's rate is the only honest answer.
    const totals = summarizeHopeQueue([entry({ rateCents: 7500 })]);
    expect(totals.awaitingCents).toBe(7500);
  });

  it('is all zeroes for an empty queue', () => {
    expect(summarizeHopeQueue([])).toEqual({
      awaitingCount: 0,
      awaitingCents: 0,
      submittedCount: 0,
      submittedCents: 0,
      paidCount: 0,
      paidCents: 0,
      rejectedCount: 0,
    });
  });
});
