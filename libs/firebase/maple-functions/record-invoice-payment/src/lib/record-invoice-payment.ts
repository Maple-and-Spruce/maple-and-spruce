/**
 * Record Invoice Payment Cloud Function
 *
 * Records an off-Square payment against a sent private-pay lesson invoice,
 * flipping it to paid and attributing it to a human-recordable source:
 *   - `admin-manual` — cash / check / other, marked paid by a human.
 *   - `venmo-manual` — a Venmo payment witnessed at the studio (the student
 *     scanned the business Venmo QR). Venmo Business Profiles have no
 *     API/webhook, so the payment is attested here and later confirmed by the
 *     statement-reconciliation tool (#630). See epic #626.
 *
 * The `square-webhook` path (`markPaidBySquareWebhook`) is separate; clients
 * cannot spoof `square-webhook` or `venmo-import` — only the two manual
 * sources are accepted here.
 *
 * Admin-gated today. The same callable will serve the teacher "My Day" page
 * (#631) once lesson-teacher ownership (#616) lands — at which point the role
 * gate widens and an ownership check is added.
 */
import {
  createAdminFunction,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import { InvoiceRepository } from '@maple/firebase/database';
import { MANUAL_INVOICE_PAYMENT_SOURCES } from '@maple/ts/domain';
import type {
  RecordInvoicePaymentRequest,
  RecordInvoicePaymentResponse,
} from '@maple/ts/firebase/api-types';

const MAX_NOTE_LENGTH = 500;

export const recordInvoicePayment = createAdminFunction<
  RecordInvoicePaymentRequest,
  RecordInvoicePaymentResponse
>(async (data, context) => {
  if (!data.id) {
    throwInvalidArgument('Invoice id is required');
  }
  if (!MANUAL_INVOICE_PAYMENT_SOURCES.includes(data.source)) {
    throwInvalidArgument(`Invalid payment source: ${data.source}`);
  }
  if (data.note !== undefined && data.note.length > MAX_NOTE_LENGTH) {
    throwInvalidArgument(
      `Payment note must be ${MAX_NOTE_LENGTH} characters or fewer`
    );
  }

  const existing = await InvoiceRepository.findById(data.id);
  if (!existing) {
    throwNotFound('Invoice', data.id);
  }

  // Idempotent: already paid → return as-is (mirrors the Square webhook path,
  // so a double-tap or retry never clobbers the original attribution).
  if (existing.status === 'paid') {
    return { invoice: existing };
  }

  if (existing.status !== 'sent') {
    throwFailedPrecondition(
      `Only sent invoices can be marked paid (invoice is ${existing.status}).`
    );
  }

  const trimmedNote = data.note?.trim();
  const invoice = await InvoiceRepository.recordManualPayment({
    id: data.id,
    source: data.source,
    note: trimmedNote ? trimmedNote : undefined,
    recordedByUid: context.uid,
  });

  return { invoice };
});
