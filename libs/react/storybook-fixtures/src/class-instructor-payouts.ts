import type { ClassInstructorStatement } from '@maple/ts/domain';
import type {
  ClassInstructorPayoutPreview,
  GetClassInstructorStatementsResponse,
} from '@maple/ts/firebase/api-types';

/**
 * Class-instructor payout fixtures. Instructors and classes are invented.
 */

const glassSeries = {
  classId: 'class-glass',
  className: 'Stained Glass Series',
  totalSessions: 2,
  sessions: [{ index: 0, at: new Date('2026-10-28T22:00:00Z') }],
  includesEarlierMonths: false,
  headcount: 3,
  registrationIds: ['reg-001', 'reg-002'],
  grossCents: 15000,
  shareCents: 12000,
};

const weaving = {
  classId: 'class-weave',
  className: 'Beginner Weaving',
  totalSessions: 1,
  sessions: [{ index: 0, at: new Date('2026-10-10T18:00:00Z') }],
  includesEarlierMonths: false,
  headcount: 6,
  registrationIds: ['reg-003', 'reg-004', 'reg-005'],
  grossCents: 36000,
  shareCents: 28800,
};

const refundAdjustment = {
  kind: 'refund' as const,
  registrationId: 'reg-000',
  classId: 'class-clay',
  className: 'Hand-Built Clay',
  refundedAt: new Date('2026-10-14T16:00:00Z'),
  shareCents: -4000,
};

export const mockPreviewHazel: ClassInstructorPayoutPreview = {
  instructorId: 'instructor-hazel',
  instructorName: 'Hazel Marsh',
  payRate: 0.8,
  month: '2026-10',
  classes: [glassSeries],
  adjustments: [refundAdjustment],
  grossCents: 15000,
  shareCents: 12000,
  adjustmentsCents: -4000,
  totalOwedCents: 8000,
  missingRateConfig: false,
};

export const mockPreviewJuniper: ClassInstructorPayoutPreview = {
  instructorId: 'instructor-juniper',
  instructorName: 'Juniper Cole',
  payRate: 0.8,
  month: '2026-10',
  classes: [weaving],
  adjustments: [],
  grossCents: 36000,
  shareCents: 28800,
  adjustmentsCents: 0,
  totalOwedCents: 28800,
  missingRateConfig: false,
};

export const mockPreviewMissingRate: ClassInstructorPayoutPreview = {
  instructorId: 'instructor-rowan',
  instructorName: 'Rowan Pike',
  month: '2026-10',
  classes: [{ ...weaving, classId: 'class-basket', className: 'Basketry', shareCents: 0 }],
  adjustments: [],
  grossCents: 36000,
  shareCents: 0,
  adjustmentsCents: 0,
  totalOwedCents: 0,
  missingRateConfig: true,
};

export const mockPreviewAlreadyStated: ClassInstructorPayoutPreview = {
  ...mockPreviewJuniper,
  classes: [],
  grossCents: 0,
  shareCents: 0,
  totalOwedCents: 0,
  existingStatement: { id: 'stmt-juniper-oct', status: 'pending', totalOwedCents: 28800 },
};

const created = new Date('2026-11-02T14:00:00Z');

export const mockStatementPending: ClassInstructorStatement = {
  id: 'stmt-hazel-oct',
  instructorId: 'instructor-hazel',
  instructorName: 'Hazel Marsh',
  payRate: 0.8,
  month: '2026-10',
  status: 'pending',
  classes: [glassSeries, { ...weaving, className: 'Weaving Refresher' }],
  adjustments: [refundAdjustment],
  grossCents: 51000,
  shareCents: 40800,
  adjustmentsCents: -4000,
  totalOwedCents: 36800,
  entryIds: [],
  createdAt: created,
  updatedAt: created,
};

export const mockStatementPaid: ClassInstructorStatement = {
  ...mockStatementPending,
  id: 'stmt-juniper-sep',
  instructorId: 'instructor-juniper',
  instructorName: 'Juniper Cole',
  month: '2026-09',
  status: 'paid',
  classes: [{ ...weaving, sessions: [{ index: 0, at: new Date('2026-09-12T18:00:00Z') }] }],
  adjustments: [],
  grossCents: 36000,
  shareCents: 28800,
  adjustmentsCents: 0,
  totalOwedCents: 28800,
  paidOn: '2026-10-03',
  paymentMethod: 'payroll',
  paymentReference: 'PR-2026-10-A',
};

export const mockStatementVoid: ClassInstructorStatement = {
  ...mockStatementPending,
  id: 'stmt-hazel-oct-old',
  status: 'void',
  voidedAt: created,
};

export const mockStatementsResponse: GetClassInstructorStatementsResponse = {
  statements: [mockStatementPending, mockStatementVoid, mockStatementPaid],
  paidThisYearByInstructor: { 'instructor-juniper': 28800 },
};
