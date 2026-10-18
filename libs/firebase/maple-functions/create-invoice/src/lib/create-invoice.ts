/**
 * Create Invoice Cloud Function
 *
 * Creates a private-pay music-lesson invoice for a student. Hope
 * Scholarship students are guarded at the server boundary and MUST NOT be
 * invoiced through this flow — they invoice externally via the EMA
 * portal. See legacy epic #10 / legacy issue #282.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import {
  InvoiceRepository,
  LessonScheduledChargeRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { coveredLessonIds, invoicedLessonIds } from '@maple/ts/domain';
import { invoiceValidation } from '@maple/ts/validation';
import type {
  CreateInvoiceRequest,
  CreateInvoiceResponse,
} from '@maple/ts/firebase/api-types';

export const createInvoice = createAdminFunction<
  CreateInvoiceRequest,
  CreateInvoiceResponse
>(async (data, context) => {
  const validationResult = invoiceValidation(data);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const student = await StudentRepository.findById(data.studentId);
  if (!student) {
    throw new Error(`Student not found: ${data.studentId}`);
  }

  if (student.isHopeScholarship) {
    throw new Error(
      'Cannot invoice a Hope Scholarship student through this flow — invoicing happens externally via the EMA portal.'
    );
  }

  // Recording a payment already taken (cash, check, Venmo) is the one create
  // that settles lessons outright, so it must not settle teaching that is
  // already charged or on another invoice: that would record the family as
  // paying twice for the same lesson.
  if (data.status === 'paid') {
    const lessonIds = data.lineItems
      .map((line) => line.lessonId)
      .filter((id): id is string => Boolean(id));
    if (lessonIds.length > 0) {
      const [charges, invoices] = await Promise.all([
        LessonScheduledChargeRepository.findAll({ studentId: data.studentId }),
        InvoiceRepository.findAll({ studentId: data.studentId }),
      ]);
      const covered = coveredLessonIds(charges);
      const invoiced = invoicedLessonIds(invoices);
      const clash = lessonIds.filter(
        (id) => covered.has(id) || invoiced.has(id)
      );
      if (clash.length > 0) {
        throw new Error(
          `${clash.length} of these lessons are already charged or invoiced. Refresh and try again.`
        );
      }
    }
  }

  const invoice = await InvoiceRepository.create(data, {
    recordedByUid: context?.uid,
  });

  return { invoice };
});
