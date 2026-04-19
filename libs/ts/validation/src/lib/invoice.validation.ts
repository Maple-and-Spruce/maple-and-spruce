/**
 * Invoice validation suite
 *
 * Vest validation for private-pay music lesson invoices. Used both by the
 * admin form and the cloud-function createInvoice/updateInvoice handlers.
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { CreateInvoiceInput } from '@maple/ts/domain';
import { INVOICE_STATUSES } from '@maple/ts/domain';

export const invoiceValidation = staticSuite(
  (data: Partial<CreateInvoiceInput>, field?: string | string[]) => {
    only(field);

    test('studentId', 'Student is required', () => {
      enforce(data.studentId).isNotBlank();
    });

    test('status', 'Status must be draft, sent, paid, or void', () => {
      if (data.status !== undefined && data.status !== null) {
        enforce(data.status).inside(INVOICE_STATUSES);
      }
    });

    test('lineItems', 'At least one line item is required', () => {
      enforce(data.lineItems).isArray();
      enforce(data.lineItems?.length ?? 0).greaterThan(0);
    });

    test('lineItems', 'Each line item must have a description', () => {
      if (Array.isArray(data.lineItems)) {
        for (const line of data.lineItems) {
          enforce(line?.description ?? '').isNotBlank();
        }
      }
    });

    test('lineItems', 'Line item quantity must be > 0', () => {
      if (Array.isArray(data.lineItems)) {
        for (const line of data.lineItems) {
          enforce(line?.quantity ?? 0).greaterThan(0);
        }
      }
    });

    test(
      'lineItems',
      'Line item unit amount must be >= 0 (in cents)',
      () => {
        if (Array.isArray(data.lineItems)) {
          for (const line of data.lineItems) {
            enforce(line?.unitAmountCents ?? -1).greaterThanOrEquals(0);
          }
        }
      }
    );

    test('lineItems', 'Line item id must be set', () => {
      if (Array.isArray(data.lineItems)) {
        for (const line of data.lineItems) {
          enforce(line?.id ?? '').isNotBlank();
        }
      }
    });

    test('notes', 'Notes must be less than 2000 characters', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(2000);
      }
    });
  }
);
