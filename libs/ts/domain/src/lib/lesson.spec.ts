import { describe, it, expect } from 'vitest';
import { isLessonUpcoming, isLessonPast, type Lesson } from './lesson';

describe('Lesson domain helpers', () => {
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
});
