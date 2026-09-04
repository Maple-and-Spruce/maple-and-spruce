import { describe, it, expect } from 'vitest';
import {
  LESSON_INQUIRY_STALE_DAYS,
  daysWaiting,
  isLessonInquiryOpen,
  isLessonInquiryStale,
  isValidStatusChange,
} from './lesson-inquiry';
import type { LessonInquiry, LessonInquiryStatus } from './lesson-inquiry';

const NOW = new Date('2026-09-10T12:00:00Z');

function inquiry(
  overrides: Partial<Pick<LessonInquiry, 'status' | 'submittedAt'>> = {}
): Pick<LessonInquiry, 'status' | 'submittedAt'> {
  return {
    status: 'new',
    submittedAt: NOW,
    ...overrides,
  };
}

describe('isValidStatusChange', () => {
  it('allows moving backwards, because humans misclick', () => {
    // The queue is worked between lessons by two people. A state machine that
    // refuses to undo a mistake gets worked around, not obeyed.
    expect(isValidStatusChange('new', undefined)).toBe(true);
    expect(isValidStatusChange('contacted', undefined)).toBe(true);
    expect(isValidStatusChange('lost', undefined)).toBe(true);
  });

  it('refuses to mark enrolled without the student it became', () => {
    // An enrolled lead pointing at nothing is the broken link this entity
    // exists to prevent.
    expect(isValidStatusChange('enrolled', undefined)).toBe(false);
    expect(isValidStatusChange('enrolled', '')).toBe(false);
    expect(isValidStatusChange('enrolled', '   ')).toBe(false);
    expect(isValidStatusChange('enrolled', 'student-1')).toBe(true);
  });

  it('rejects a status that is not a status', () => {
    expect(isValidStatusChange('archived' as LessonInquiryStatus, undefined)).toBe(
      false
    );
  });
});

describe('isLessonInquiryOpen', () => {
  it.each([
    ['new', true],
    ['contacted', true],
    ['interview-booked', true],
    ['enrolled', false],
    ['lost', false],
  ] as const)('%s -> open: %s', (status, expected) => {
    expect(isLessonInquiryOpen(inquiry({ status }))).toBe(expected);
  });
});

describe('daysWaiting', () => {
  it('counts whole days since the family submitted', () => {
    expect(
      daysWaiting(inquiry({ submittedAt: new Date('2026-09-07T12:00:00Z') }), NOW)
    ).toBe(3);
  });

  it('does not round a partial day up', () => {
    expect(
      daysWaiting(inquiry({ submittedAt: new Date('2026-09-09T13:00:00Z') }), NOW)
    ).toBe(0);
  });

  it('returns 0 rather than a negative for a clock-skewed future timestamp', () => {
    expect(
      daysWaiting(inquiry({ submittedAt: new Date('2026-09-11T12:00:00Z') }), NOW)
    ).toBe(0);
  });

  it('returns 0 for an unparseable date instead of NaN', () => {
    expect(daysWaiting(inquiry({ submittedAt: new Date('nope') }), NOW)).toBe(0);
  });
});

describe('isLessonInquiryStale', () => {
  it('flags an unanswered inquiry past the follow-up promise', () => {
    const submittedAt = new Date(
      NOW.getTime() - LESSON_INQUIRY_STALE_DAYS * 86_400_000
    );
    expect(isLessonInquiryStale(inquiry({ submittedAt }), NOW)).toBe(true);
  });

  it('does not flag one still inside the window', () => {
    const submittedAt = new Date(NOW.getTime() - 86_400_000);
    expect(isLessonInquiryStale(inquiry({ submittedAt }), NOW)).toBe(false);
  });

  it('never flags a closed inquiry, however old', () => {
    // An enrolled family from last spring is not an outstanding task.
    const submittedAt = new Date('2026-01-01T00:00:00Z');
    expect(
      isLessonInquiryStale(inquiry({ status: 'enrolled', submittedAt }), NOW)
    ).toBe(false);
    expect(
      isLessonInquiryStale(inquiry({ status: 'lost', submittedAt }), NOW)
    ).toBe(false);
  });
});
