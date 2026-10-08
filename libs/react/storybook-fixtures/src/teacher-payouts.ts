import type { TeacherPayout } from '@maple/ts/domain';

/**
 * Mock teacher payout data for Storybook stories.
 */

export const mockPayoutPrimary: TeacherPayout = {
  teacherId: 'instructor-001',
  teacherName: 'Sarah Miller',
  totalOwedCents: 15000,
  missingRateConfig: false,
  unpricedHopeLessonCount: 0,
  unpricedHopePayPendingCount: 0,
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
      baseRevenueCents: 5500,
      asSubstitute: false,
    },
  ],
};

export const mockPayoutSubstitute: TeacherPayout = {
  teacherId: 'instructor-002',
  teacherName: 'James Wilson',
  totalOwedCents: 2400,
  missingRateConfig: false,
  unpricedHopeLessonCount: 0,
  unpricedHopePayPendingCount: 0,
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
  unpricedHopeLessonCount: 0,
  unpricedHopePayPendingCount: 0,
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

/**
 * A percentage teacher with one priced Hope lesson and one whose student is on
 * no EMA product (#83): the unpriced one is listed with no price, and the
 * teacher's share of it is left out of the total until a product is set.
 */
export const mockPayoutUnpricedHope: TeacherPayout = {
  teacherId: 'instructor-004',
  teacherName: 'Dana Brooks',
  totalOwedCents: 1800,
  missingRateConfig: false,
  unpricedHopeLessonCount: 1,
  unpricedHopePayPendingCount: 1,
  lines: [
    {
      lessonId: 'lesson-hope-priced',
      studentId: 'student-hope-3',
      studentName: 'Wren Lowell',
      scheduledAt: new Date('2026-04-16T15:00:00Z'),
      durationMinutes: 30,
      source: 'hope-rendered',
      compensationCents: 1800,
      baseRevenueCents: 3000,
      asSubstitute: false,
    },
    {
      lessonId: 'lesson-hope-unpriced',
      studentId: 'student-hope-4',
      studentName: 'Test Student',
      scheduledAt: new Date('2026-04-09T15:00:00Z'),
      durationMinutes: 30,
      source: 'hope-rendered',
      compensationCents: undefined,
      baseRevenueCents: undefined,
      asSubstitute: false,
    },
  ],
};

/**
 * A flat-rate teacher with an unpriced Hope lesson (#83): flat pay does not
 * depend on the price, so it is owed and in the total; the lesson is still
 * flagged because EMA cannot be billed without a product.
 */
export const mockPayoutUnpricedHopeFlat: TeacherPayout = {
  teacherId: 'instructor-005',
  teacherName: 'Ari Chen',
  totalOwedCents: 2500,
  missingRateConfig: false,
  unpricedHopeLessonCount: 1,
  unpricedHopePayPendingCount: 0,
  lines: [
    {
      lessonId: 'lesson-hope-unpriced-flat',
      studentId: 'student-hope-5',
      studentName: 'Test Student',
      scheduledAt: new Date('2026-04-08T15:00:00Z'),
      durationMinutes: 30,
      source: 'hope-rendered',
      compensationCents: 2500,
      baseRevenueCents: undefined,
      asSubstitute: false,
    },
  ],
};

export const mockTeacherPayouts: TeacherPayout[] = [
  mockPayoutPrimary,
  mockPayoutSubstitute,
  mockPayoutMissingRate,
  mockPayoutUnpricedHope,
  mockPayoutUnpricedHopeFlat,
];
