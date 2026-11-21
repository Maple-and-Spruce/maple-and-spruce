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
  pendingStatements: [],
  owedCents: 8000,
  paidThisYearCents: 0,
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
  pendingStatements: [],
  owedCents: 28800,
  paidThisYearCents: 0,
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
  pendingStatements: [],
  owedCents: 0,
  paidThisYearCents: 0,
};

export const mockPreviewAlreadyStated: ClassInstructorPayoutPreview = {
  ...mockPreviewJuniper,
  classes: [],
  grossCents: 0,
  shareCents: 0,
  totalOwedCents: 0,
  pendingStatements: [
    {
      id: 'stmt-juniper-oct',
      totalOwedCents: 28800,
      coversFrom: '2026-10-10',
      coversTo: '2026-10-10',
    },
  ],
  owedCents: 28800,
};

// ── Paid per class (#344) ─────────────────────────────────────────────
// An instructor on 75% teaches two one-session classes in a month: eight
// paid seats at $65 each, so $520 from students and $390 to her per class.

const perClassLine = (classId: string, className: string, at: string) => ({
  classId,
  className,
  totalSessions: 1,
  sessions: [{ index: 0, at: new Date(at) }],
  includesEarlierMonths: false,
  headcount: 8,
  registrationIds: Array.from({ length: 8 }, (_, i) => `${classId}-reg-${i + 1}`),
  grossCents: 52000,
  shareCents: 39000,
});

const wreathLine = perClassLine('class-wreath', 'Evergreen Wreaths', '2026-11-08T19:00:00Z');
const ornamentLine = perClassLine('class-ornament', 'Felted Ornaments', '2026-11-21T19:00:00Z');

const perClassBase = {
  instructorId: 'instructor-fern',
  instructorName: 'Fern Alder',
  payRate: 0.75,
  month: '2026-11',
  adjustments: [],
  adjustmentsCents: 0,
  missingRateConfig: false,
};

/** The first class is paid; the second has just finished and is on no statement. */
export const mockPreviewSecondClassOwed: ClassInstructorPayoutPreview = {
  ...perClassBase,
  classes: [ornamentLine],
  grossCents: 52000,
  shareCents: 39000,
  totalOwedCents: 39000,
  pendingStatements: [],
  owedCents: 39000,
  paidThisYearCents: 39000,
};

/** Both classes are on paid statements: nothing owed. */
export const mockPreviewPaidUp: ClassInstructorPayoutPreview = {
  ...perClassBase,
  classes: [],
  grossCents: 0,
  shareCents: 0,
  totalOwedCents: 0,
  pendingStatements: [],
  owedCents: 0,
  paidThisYearCents: 78000,
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
  paidByYearByInstructor: { 'instructor-juniper': { '2026': 28800 } },
};

const perClassStatement = (
  id: string,
  line: typeof wreathLine,
  paidOn: string,
  paymentReference: string
): ClassInstructorStatement => ({
  id,
  instructorId: perClassBase.instructorId,
  instructorName: perClassBase.instructorName,
  payRate: 0.75,
  month: '2026-11',
  status: 'paid',
  classes: [line],
  adjustments: [],
  grossCents: 52000,
  shareCents: 39000,
  adjustmentsCents: 0,
  totalOwedCents: 39000,
  entryIds: [],
  paidOn,
  paymentMethod: 'payroll',
  paymentReference,
  createdAt: created,
  updatedAt: created,
});

/** Two paid statements for one instructor in one month, one per class. */
export const mockStatementFirstClass = perClassStatement(
  'stmt-fern-wreath',
  wreathLine,
  '2026-11-11',
  'PR-2026-11-A'
);
export const mockStatementSecondClass = perClassStatement(
  'stmt-fern-ornament',
  ornamentLine,
  '2026-11-22',
  'PR-2026-11-B'
);

export const mockPerClassStatementsResponse: GetClassInstructorStatementsResponse = {
  statements: [mockStatementSecondClass, mockStatementFirstClass, mockStatementPaid],
  paidThisYearByInstructor: { 'instructor-fern': 78000, 'instructor-juniper': 28800 },
  paidByYearByInstructor: {
    'instructor-fern': { '2026': 78000 },
    'instructor-juniper': { '2026': 28800, '2025': 12000 },
  },
};
