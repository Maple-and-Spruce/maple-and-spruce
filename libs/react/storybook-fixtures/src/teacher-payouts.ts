import type { TeacherPayout } from '@maple/ts/domain';

/**
 * Mock teacher payout data for Storybook stories.
 */

export const mockPayoutPrimary: TeacherPayout = {
  teacherId: 'instructor-001',
  teacherName: 'Sarah Miller',
  totalOwedCents: 15000,
  missingRateConfig: false,
  lines: [
    {
      lessonId: 'lesson-001',
      invoiceId: 'inv-001',
      studentId: 'student-001',
      studentName: 'Olive Thompson',
      scheduledAt: new Date('2026-04-21T15:00:00Z'),
      durationMinutes: 30,
      source: 'private-paid',
      compensationCents: 5000,
      baseRevenueCents: 4000,
      asSubstitute: false,
    },
    {
      lessonId: 'lesson-002',
      invoiceId: 'inv-001',
      studentId: 'student-001',
      studentName: 'Olive Thompson',
      scheduledAt: new Date('2026-04-14T15:00:00Z'),
      durationMinutes: 30,
      source: 'private-paid',
      compensationCents: 5000,
      baseRevenueCents: 4000,
      asSubstitute: false,
    },
    {
      lessonId: 'lesson-hope-1',
      studentId: 'student-hope',
      studentName: 'Felix Rivera',
      scheduledAt: new Date('2026-04-10T15:00:00Z'),
      durationMinutes: 45,
      source: 'hope-rendered',
      compensationCents: 5000,
      baseRevenueCents: 5875,
      asSubstitute: false,
    },
  ],
};

export const mockPayoutSubstitute: TeacherPayout = {
  teacherId: 'instructor-002',
  teacherName: 'James Wilson',
  totalOwedCents: 2400,
  missingRateConfig: false,
  lines: [
    {
      lessonId: 'lesson-sub',
      invoiceId: 'inv-001',
      studentId: 'student-001',
      studentName: 'Olive Thompson',
      scheduledAt: new Date('2026-04-28T15:00:00Z'),
      durationMinutes: 30,
      source: 'private-paid',
      compensationCents: 2400,
      baseRevenueCents: 4000,
      asSubstitute: true,
    },
  ],
};

export const mockPayoutMissingRate: TeacherPayout = {
  teacherId: 'instructor-003',
  teacherName: 'Maria Santos',
  totalOwedCents: 0,
  missingRateConfig: true,
  lines: [
    {
      lessonId: 'lesson-nr',
      studentId: 'student-hope-2',
      studentName: 'Iris Park',
      scheduledAt: new Date('2026-04-12T15:00:00Z'),
      durationMinutes: 60,
      source: 'hope-rendered',
      compensationCents: undefined,
      baseRevenueCents: 7500,
      asSubstitute: false,
    },
  ],
};

export const mockTeacherPayouts: TeacherPayout[] = [
  mockPayoutPrimary,
  mockPayoutSubstitute,
  mockPayoutMissingRate,
];
