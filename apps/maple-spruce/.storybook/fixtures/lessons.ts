import type { Lesson } from '@maple/ts/domain';

/**
 * Mock music lesson data for Storybook stories.
 */

const NOW = new Date('2026-05-01T10:00:00Z');

export const mockLessonUpcomingSingle: Lesson = {
  id: 'lesson-001',
  studentId: 'student-001',
  scheduledAt: new Date('2026-05-10T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'instructor-001',
  status: 'scheduled',
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockLessonUpcomingSeries: Lesson = {
  id: 'lesson-002',
  studentId: 'student-001',
  scheduledAt: new Date('2026-05-17T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'instructor-001',
  seriesId: 'series-spring',
  status: 'scheduled',
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockLessonUpcomingSubstitute: Lesson = {
  id: 'lesson-003',
  studentId: 'student-001',
  scheduledAt: new Date('2026-05-24T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'instructor-002', // sub — differs from student's primary
  seriesId: 'series-spring',
  status: 'scheduled',
  notes: 'Sarah is on vacation; James covers.',
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockLessonPastRendered: Lesson = {
  id: 'lesson-004',
  studentId: 'student-001',
  scheduledAt: new Date('2026-04-26T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'instructor-001',
  seriesId: 'series-spring',
  status: 'rendered',
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockLessonCancelled: Lesson = {
  id: 'lesson-005',
  studentId: 'student-001',
  scheduledAt: new Date('2026-04-19T15:00:00Z'),
  durationMinutes: 30,
  teacherId: 'instructor-001',
  seriesId: 'series-spring',
  status: 'cancelled',
  notes: 'Holiday week — skipped.',
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockLessons: Lesson[] = [
  mockLessonUpcomingSingle,
  mockLessonUpcomingSeries,
  mockLessonUpcomingSubstitute,
  mockLessonPastRendered,
  mockLessonCancelled,
];
