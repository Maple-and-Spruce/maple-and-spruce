/**
 * Get Teacher Payouts Cloud Function (#283)
 *
 * Aggregates teacher payouts for a period:
 *   - Paid private-pay invoice lines that reference a lesson
 *   - Rendered Hope-Scholarship lessons (external EMA billing)
 *
 * Admin-only. Small studio, so we fetch + compute in memory rather than
 * pre-aggregating a Payout collection.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import {
  InstructorRepository,
  InvoiceRepository,
  LessonRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { aggregateTeacherPayouts } from '@maple/ts/domain';
import type {
  GetTeacherPayoutsRequest,
  GetTeacherPayoutsResponse,
} from '@maple/ts/firebase/api-types';

export const getTeacherPayouts = createAdminFunction<
  GetTeacherPayoutsRequest,
  GetTeacherPayoutsResponse
>(async (data) => {
  const from = new Date(data.from);
  const to = new Date(data.to);

  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    throw new Error("Invalid 'from' / 'to' date strings");
  }
  if (from.getTime() > to.getTime()) {
    throw new Error("'from' must be before 'to'");
  }

  // --- Gather raw data -------------------------------------------------

  // Rendered lessons with scheduledAt in range — Hope-side source.
  const lessonsInRange = await LessonRepository.findAll({
    status: 'rendered',
    from,
    to,
  });

  // All invoices — we filter by paidAt in range below since Firestore
  // doesn't index paidAt and the invoice volume is small.
  const allInvoices = await InvoiceRepository.findAll();
  const paidInvoices = allInvoices.filter((invoice) => {
    if (invoice.status !== 'paid') return false;
    if (!invoice.paidAt) return false;
    const paidAt = invoice.paidAt.getTime();
    return paidAt >= from.getTime() && paidAt <= to.getTime();
  });

  // Lessons referenced by paid-invoice lines — may be outside the
  // scheduledAt range, so fetch them explicitly to avoid missing any.
  const invoicedLessonIds = new Set<string>();
  for (const invoice of paidInvoices) {
    for (const line of invoice.lineItems) {
      if (line.lessonId) invoicedLessonIds.add(line.lessonId);
    }
  }
  const lessonsById = new Map(lessonsInRange.map((l) => [l.id, l]));
  const missingLessonIds = [...invoicedLessonIds].filter(
    (id) => !lessonsById.has(id)
  );
  const extraLessons = (
    await Promise.all(
      missingLessonIds.map((id) => LessonRepository.findById(id))
    )
  ).filter((l): l is NonNullable<typeof l> => !!l);

  const students = await StudentRepository.findAll();
  const instructors = await InstructorRepository.findAll();

  const payouts = aggregateTeacherPayouts({
    lessons: [...lessonsInRange, ...extraLessons],
    paidInvoices,
    students,
    instructors,
    teacherIdFilter: data.teacherId,
  });

  return { payouts };
});
