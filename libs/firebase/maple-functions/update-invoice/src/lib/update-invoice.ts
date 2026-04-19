/**
 * Update Invoice Cloud Function
 *
 * Applies edits to an invoice: line items (while still draft or sent),
 * notes, and status transitions. Status transitions are validated against
 * the rules in `isInvoiceStatusTransitionAllowed` — e.g. paid → sent is
 * rejected. The repository auto-stamps issuedAt / paidAt on the
 * appropriate transitions.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { InvoiceRepository } from '@maple/firebase/database';
import { invoiceValidation } from '@maple/ts/validation';
import { isInvoiceStatusTransitionAllowed } from '@maple/ts/domain';
import type {
  UpdateInvoiceRequest,
  UpdateInvoiceResponse,
} from '@maple/ts/firebase/api-types';

export const updateInvoice = createAdminFunction<
  UpdateInvoiceRequest,
  UpdateInvoiceResponse
>(async (data) => {
  const existing = await InvoiceRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Invoice', data.id);
  }

  if (
    data.status !== undefined &&
    !isInvoiceStatusTransitionAllowed(existing.status, data.status)
  ) {
    throw new Error(
      `Invalid status transition: ${existing.status} → ${data.status}`
    );
  }

  // Merge with existing so partial updates still pass full validation
  const merged = {
    studentId: existing.studentId,
    status: data.status ?? existing.status,
    lineItems: data.lineItems ?? existing.lineItems,
    notes: data.notes ?? existing.notes,
  };

  const validationResult = invoiceValidation(merged);
  if (!validationResult.isValid()) {
    const errors = validationResult.getErrors();
    const errorMessages = Object.entries(errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ');
    throw new Error(`Validation failed: ${errorMessages}`);
  }

  const invoice = await InvoiceRepository.update(data, existing);

  return { invoice };
});
