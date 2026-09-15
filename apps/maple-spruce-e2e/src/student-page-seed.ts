/**
 * Seed data for the student page e2e: one private-pay student with lessons,
 * invoices and card charges in every state the page treats differently, plus a
 * Hope Scholarship student whose page must show no billing at all.
 *
 * Everyone here is invented. Dates are relative to "now" so past and upcoming
 * stay past and upcoming whenever the suite runs.
 *
 * Amounts are distinct on purpose: the spec finds a billing row by its amount.
 *
 * `setFirestoreDoc` replaces the whole document, so calling this again resets
 * anything a test changed — which is what lets the mutating test retry.
 */
import { setFirestoreDoc } from '@maple/firebase/integration-test-utils';

export const STUDENT_ID = 'e2e-stu-private';
export const STUDENT_NAME = 'Robin Ashfield';
export const HOPE_STUDENT_ID = 'e2e-stu-hope';
export const HOPE_STUDENT_NAME = 'Wren Holloway';
const TEACHER_ID = 'e2e-teacher';

/** Billing row amounts, as the table formats them. */
export const AMOUNTS = {
  chargeToWaive: '$41.25',
  chargeToCancel: '$82.50',
  manualPaidCharge: '$165.00',
  failedCharge: '$99.00',
  sentInvoice: '$130.00',
  paidInvoice: '$65.00',
} as const;

const DAY = 86_400_000;

export async function seedStudentPage(now: Date = new Date()): Promise<void> {
  const at = (days: number) => new Date(now.getTime() + days * DAY);
  const stamps = { createdAt: at(-30), updatedAt: at(-30) };

  await setFirestoreDoc('instructors', TEACHER_ID, {
    name: 'Test Teacher',
    email: 'teacher@example.com',
    status: 'active',
    ...stamps,
  });

  const student = {
    instrument: 'violin',
    isAdultStudent: false,
    primaryTeacherId: TEACHER_ID,
    registeredLessonLength: '30-min-full',
    primaryContactName: 'Test Parent',
    status: 'active',
    // Never let a lesson write here spin up a real auto-invoice.
    autoInvoice: false,
    ...stamps,
  };
  await setFirestoreDoc('students', STUDENT_ID, {
    ...student,
    name: STUDENT_NAME,
    primaryContactEmail: 'robin-parent@example.com',
    isHopeScholarship: false,
  });
  await setFirestoreDoc('students', HOPE_STUDENT_ID, {
    ...student,
    name: HOPE_STUDENT_NAME,
    primaryContactEmail: 'wren-parent@example.com',
    isHopeScholarship: true,
  });

  const lesson = (id: string, days: number, status: string) =>
    setFirestoreDoc('lessons', id, {
      studentId: STUDENT_ID,
      teacherId: TEACHER_ID,
      scheduledAt: at(days),
      durationMinutes: 30,
      status,
      ...stamps,
    });
  await lesson('e2e-les-taught', -14, 'rendered');
  await lesson('e2e-les-awaiting', -2, 'scheduled');
  await lesson('e2e-les-next', 5, 'scheduled');
  await lesson('e2e-les-after', 12, 'scheduled');

  const charge = (
    id: string,
    fields: {
      amountCents: number;
      dueInDays: number;
      status: string;
      lessonIds: string[];
      ruleId?: string;
      lastError?: string;
    }
  ) =>
    setFirestoreDoc('lessonScheduledCharges', id, {
      studentId: STUDENT_ID,
      ruleId: fields.ruleId ?? 'rule-standard',
      lessonIds: fields.lessonIds,
      amountCents: fields.amountCents,
      dueAt: at(fields.dueInDays),
      status: fields.status,
      idempotencyKey: `lesson-${id}`,
      ...(fields.lastError ? { lastError: fields.lastError } : {}),
      ...stamps,
    });
  await charge('chg-e2e-waive', {
    amountCents: 4125,
    dueInDays: 4,
    status: 'scheduled',
    lessonIds: ['e2e-les-next'],
  });
  await charge('chg-e2e-cancel', {
    amountCents: 8250,
    dueInDays: 11,
    status: 'scheduled',
    lessonIds: ['e2e-les-after'],
  });
  await charge('chg-e2e-manual', {
    amountCents: 16500,
    dueInDays: -15,
    status: 'paid',
    ruleId: 'manual',
    lessonIds: ['e2e-les-taught'],
  });
  await charge('chg-e2e-failed', {
    amountCents: 9900,
    dueInDays: -1,
    status: 'failed',
    lastError: 'Card declined',
    lessonIds: ['e2e-les-awaiting'],
  });

  const line = (cents: number) => [
    {
      id: 'line-1',
      description: 'Lesson',
      quantity: 1,
      unitAmountCents: cents,
      subtotalCents: cents,
    },
  ];
  // A sent invoice that already carries its Square ids, so the sync trigger
  // has nothing to do and never reaches for Square.
  await setFirestoreDoc('invoices', 'inv-e2e-sent', {
    studentId: STUDENT_ID,
    status: 'sent',
    lineItems: line(13000),
    totalCents: 13000,
    issuedAt: at(-6),
    squareOrderId: 'SQ-ORDER-e2e',
    squareInvoiceId: 'SQ-INVOICE-e2e',
    ...stamps,
  });
  await setFirestoreDoc('invoices', 'inv-e2e-paid', {
    studentId: STUDENT_ID,
    status: 'paid',
    lineItems: line(6500),
    totalCents: 6500,
    issuedAt: at(-25),
    paidAt: at(-24),
    paymentRecord: { source: 'admin-manual', recordedAt: at(-24) },
    squareOrderId: 'SQ-ORDER-e2e-paid',
    squareInvoiceId: 'SQ-INVOICE-e2e-paid',
    ...stamps,
  });
}
