/**
 * Create Invoice Cloud Function
 *
 * Creates a private-pay music-lesson invoice for a student. Hope
 * Scholarship students are guarded at the server boundary and MUST NOT be
 * invoiced through this flow — they invoice externally via the EMA
 * portal. See epic #10 / issue #282.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import {
  InvoiceRepository,
  StudentRepository,
} from '@maple/firebase/database';
import { invoiceValidation } from '@maple/ts/validation';
import type {
  CreateInvoiceRequest,
  CreateInvoiceResponse,
} from '@maple/ts/firebase/api-types';

export const createInvoice = createAdminFunction<
  CreateInvoiceRequest,
  CreateInvoiceResponse
>(async (data) => {
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

  const invoice = await InvoiceRepository.create(data);

  return { invoice };
});
