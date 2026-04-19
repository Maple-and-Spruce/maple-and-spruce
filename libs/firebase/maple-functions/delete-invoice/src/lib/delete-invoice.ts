/**
 * Delete Invoice Cloud Function
 *
 * Hard-deletes an invoice, but ONLY while it is still a draft. Once sent
 * or paid, the record must be preserved for audit/history — use the void
 * status transition (via updateInvoice) to cancel instead.
 */
import { createAdminFunction, throwNotFound } from '@maple/firebase/functions';
import { InvoiceRepository } from '@maple/firebase/database';
import { isInvoiceDeletable } from '@maple/ts/domain';
import type {
  DeleteInvoiceRequest,
  DeleteInvoiceResponse,
} from '@maple/ts/firebase/api-types';

export const deleteInvoice = createAdminFunction<
  DeleteInvoiceRequest,
  DeleteInvoiceResponse
>(async (data) => {
  const existing = await InvoiceRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Invoice', data.id);
  }

  if (!isInvoiceDeletable(existing)) {
    throw new Error(
      `Invoice ${data.id} cannot be deleted once ${existing.status}; use the void status transition to cancel.`
    );
  }

  await InvoiceRepository.delete(data.id);

  return { success: true };
});
