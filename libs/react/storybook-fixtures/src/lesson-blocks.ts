import type { LessonBlock } from '@maple/ts/domain';

/**
 * Mock lesson blocks for Storybook. Teacher ids line up with the instructor
 * fixtures (instructor-001 / -002).
 */

const NOW = new Date('2026-05-01T10:00:00Z');

/** instructor-001 · Sundays 10:00 AM–1:00 PM (fits the Sunday mock lessons). */
export const mockLessonBlock: LessonBlock = {
  id: 'block-001',
  teacherId: 'instructor-001',
  dayOfWeek: 0,
  startMinutes: 10 * 60,
  endMinutes: 13 * 60,
  label: 'Sunday mornings',
  createdAt: NOW,
  updatedAt: NOW,
};

/** instructor-001 · Tuesdays 3:00–6:00 PM. */
export const mockLessonBlockTuesday: LessonBlock = {
  id: 'block-002',
  teacherId: 'instructor-001',
  dayOfWeek: 2,
  startMinutes: 15 * 60,
  endMinutes: 18 * 60,
  label: 'Tuesday afternoons',
  createdAt: NOW,
  updatedAt: NOW,
};

/** instructor-002 · Thursdays 4:00–7:00 PM. */
export const mockLessonBlockOtherTeacher: LessonBlock = {
  id: 'block-003',
  teacherId: 'instructor-002',
  dayOfWeek: 4,
  startMinutes: 16 * 60,
  endMinutes: 19 * 60,
  createdAt: NOW,
  updatedAt: NOW,
};

export const mockLessonBlocks: LessonBlock[] = [
  mockLessonBlock,
  mockLessonBlockTuesday,
  mockLessonBlockOtherTeacher,
];
