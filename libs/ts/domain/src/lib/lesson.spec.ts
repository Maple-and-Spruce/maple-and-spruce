import { describe, it, expect } from 'vitest';
import {
  isLessonUpcoming,
  isLessonPast,
  wasTaughtBySubstitute,
  type Lesson,
  LESSON_STATUSES,
  didConsumeSlot,
  isSubmittableToHope,
  lessonHappened,
} from './lesson';

const makeLesson = (overrides: Partial<Lesson> = {}): Lesson => ({
  id: 'lesson-1',
  studentId: 'student-1',
  scheduledAt: new Date('2026-05-01T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'instructor-1',
  status: 'scheduled',
  createdAt: new Date('2026-04-01T10:00:00Z'),
  updatedAt: new Date('2026-04-01T10:00:00Z'),
  ...overrides,
});

describe('Lesson domain helpers', () => {
  describe('isLessonUpcoming', () => {
    it('returns true for a scheduled lesson in the future', () => {
      const lesson = makeLesson({
        scheduledAt: new Date('2026-05-01T15:00:00Z'),
      });
      const now = new Date('2026-04-01T10:00:00Z');
      expect(isLessonUpcoming(lesson, now)).toBe(true);
    });

    it('returns false for a scheduled lesson in the past', () => {
      const lesson = makeLesson({
        scheduledAt: new Date('2026-04-01T15:00:00Z'),
      });
      const now = new Date('2026-05-01T10:00:00Z');
      expect(isLessonUpcoming(lesson, now)).toBe(false);
    });

    it('returns false for a cancelled future lesson', () => {
      const lesson = makeLesson({
        status: 'cancelled',
        scheduledAt: new Date('2026-05-01T15:00:00Z'),
      });
      const now = new Date('2026-04-01T10:00:00Z');
      expect(isLessonUpcoming(lesson, now)).toBe(false);
    });

    it('returns false for a rendered future lesson', () => {
      const lesson = makeLesson({
        status: 'rendered',
        scheduledAt: new Date('2026-05-01T15:00:00Z'),
      });
      const now = new Date('2026-04-01T10:00:00Z');
      expect(isLessonUpcoming(lesson, now)).toBe(false);
    });
  });

  describe('isLessonPast', () => {
    it('returns true for a lesson at or before now regardless of status', () => {
      const now = new Date('2026-05-01T15:00:00Z');
      expect(
        isLessonPast(
          makeLesson({ scheduledAt: new Date('2026-04-01T15:00:00Z') }),
          now
        )
      ).toBe(true);
      expect(
        isLessonPast(
          makeLesson({
            scheduledAt: new Date('2026-05-01T15:00:00Z'),
          }),
          now
        )
      ).toBe(true);
      expect(
        isLessonPast(
          makeLesson({
            status: 'cancelled',
            scheduledAt: new Date('2026-04-01T15:00:00Z'),
          }),
          now
        )
      ).toBe(true);
    });

    it('returns false for a future lesson', () => {
      const lesson = makeLesson({
        scheduledAt: new Date('2026-06-01T15:00:00Z'),
      });
      const now = new Date('2026-05-01T10:00:00Z');
      expect(isLessonPast(lesson, now)).toBe(false);
    });
  });

  describe('wasTaughtBySubstitute', () => {
    it('returns false when the lesson teacher matches the snapshot', () => {
      const lesson = {
        teacherId: 'instructor-1',
        primaryTeacherAtCreateId: 'instructor-1',
      };
      expect(wasTaughtBySubstitute(lesson)).toBe(false);
    });

    it('returns true when the lesson teacher differs from the snapshot', () => {
      const lesson = {
        teacherId: 'instructor-sub',
        primaryTeacherAtCreateId: 'instructor-primary',
      };
      expect(wasTaughtBySubstitute(lesson)).toBe(true);
    });

    it('falls back to the current primary teacher when snapshot is missing', () => {
      const lesson = {
        teacherId: 'instructor-sub',
        primaryTeacherAtCreateId: undefined,
      };
      expect(wasTaughtBySubstitute(lesson, 'instructor-primary')).toBe(true);
      expect(wasTaughtBySubstitute(lesson, 'instructor-sub')).toBe(false);
    });

    it('prefers the snapshot over the current primary (the whole point)', () => {
      // Student's primary teacher was `instructor-old` at lesson-create,
      // later reassigned to `instructor-new`. The lesson was taught by
      // `instructor-old` (the original primary). That's NOT a substitute,
      // even though teacherId !== currentPrimary.
      const lesson = {
        teacherId: 'instructor-old',
        primaryTeacherAtCreateId: 'instructor-old',
      };
      expect(wasTaughtBySubstitute(lesson, 'instructor-new')).toBe(false);
    });

    it('returns false when neither snapshot nor current primary is known', () => {
      const lesson = {
        teacherId: 'whoever',
        primaryTeacherAtCreateId: undefined,
      };
      expect(wasTaughtBySubstitute(lesson)).toBe(false);
    });
  });
});

describe('no-show status (legacy #796)', () => {
  // A no-show is its own fact because the two programs treat it oppositely:
  // private pay charges for it, Hope must never bill for it.

  it('is a status a lesson can hold', () => {
    expect(LESSON_STATUSES).toContain('no-show');
  });

  describe('didConsumeSlot — the private-pay billing and room-occupancy test', () => {
    it.each([
      ['rendered', true],
      ['no-show', true],
      ['scheduled', false],
      ['cancelled', false],
    ] as const)('%s -> %s', (status, expected) => {
      expect(didConsumeSlot(status)).toBe(expected);
    });
  });

  describe('isSubmittableToHope — services rendered only', () => {
    const NOW = new Date('2026-05-10T12:00:00Z');
    const past = (status: Lesson['status']) =>
      makeLesson({ status, scheduledAt: new Date('2026-05-03T15:00:00Z') });

    it('allows a rendered lesson', () => {
      expect(isSubmittableToHope(past('rendered'), NOW)).toBe(true);
    });

    it('allows a past lesson nobody marked taught — it happened (#157)', () => {
      expect(isSubmittableToHope(past('scheduled'), NOW)).toBe(true);
    });

    it('refuses a lesson still to come', () => {
      expect(
        isSubmittableToHope(
          makeLesson({ scheduledAt: new Date('2026-05-17T15:00:00Z') }),
          NOW
        )
      ).toBe(false);
    });

    it.each(['no-show', 'cancelled'] as const)('refuses %s', (status) => {
      expect(isSubmittableToHope(past(status), NOW)).toBe(false);
    });

    it('never allows anything lessonHappened refuses, and never a no-show', () => {
      // The whole compliance shape: every lesson Hope will pay for happened,
      // but not every lesson that happened may be billed to Hope. If these two
      // ever coincide, a no-show is reaching EMA.
      const lessons = LESSON_STATUSES.map(past);
      const submittable = lessons.filter((l) => isSubmittableToHope(l, NOW));
      const happened = lessons.filter((l) => lessonHappened(l, NOW));
      expect(happened).toEqual(expect.arrayContaining(submittable));
      expect(submittable.map((l) => l.status)).not.toContain('no-show');
      expect(happened.map((l) => l.status)).toContain('no-show');
    });
  });

  describe('lessonHappened (#157)', () => {
    const NOW = new Date('2026-05-10T12:00:00Z');

    it('counts a past scheduled lesson — nothing needs marking', () => {
      expect(
        lessonHappened(
          makeLesson({ scheduledAt: new Date('2026-05-03T15:00:00Z') }),
          NOW
        )
      ).toBe(true);
    });

    it('counts a lesson from the moment it starts', () => {
      expect(lessonHappened(makeLesson({ scheduledAt: NOW }), NOW)).toBe(true);
    });

    it('does not count one still to come', () => {
      expect(
        lessonHappened(
          makeLesson({ scheduledAt: new Date('2026-05-10T12:00:01Z') }),
          NOW
        )
      ).toBe(false);
    });

    it('never counts a cancelled lesson', () => {
      expect(
        lessonHappened(
          makeLesson({
            status: 'cancelled',
            scheduledAt: new Date('2026-05-03T15:00:00Z'),
          }),
          NOW
        )
      ).toBe(false);
    });

    it.each(['rendered', 'no-show'] as const)(
      'keeps honouring %s from the old workflow',
      (status) => {
        expect(lessonHappened(makeLesson({ status }), NOW)).toBe(true);
      }
    );
  });
});
