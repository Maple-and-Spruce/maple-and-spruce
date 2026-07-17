/**
 * Invoice API request/response types
 *
 * Types for Firebase Cloud Function calls related to private-pay music
 * lesson invoices. Hope Scholarship students are invoiced externally via
 * EMA and must not go through these endpoints.
 */
import type {
  Invoice,
  CreateInvoiceInput,
  UpdateInvoiceInput,
  InvoiceStatus,
  ManualInvoicePaymentSource,
} from '@maple/ts/domain';

// ============================================================================
// Get Invoices
// ============================================================================

export interface GetInvoicesRequest {
  studentId?: string;
  status?: InvoiceStatus;
}

export interface GetInvoicesResponse {
  invoices: Invoice[];
}

// ============================================================================
// Create Invoice
// ============================================================================

export interface CreateInvoiceRequest extends CreateInvoiceInput {}

export interface CreateInvoiceResponse {
  invoice: Invoice;
}

// ============================================================================
// Update Invoice
// ============================================================================

export interface UpdateInvoiceRequest extends UpdateInvoiceInput {}

export interface UpdateInvoiceResponse {
  invoice: Invoice;
}

// ============================================================================
// Record Invoice Payment (manual / Venmo)
// ============================================================================

/**
 * Record an off-Square payment against a sent invoice, attributing it to a
 * human-recordable source (cash/check = `admin-manual`, or `venmo-manual`).
 * The Square webhook path (`markPaidBySquareWebhook`) is separate; clients
 * cannot set `square-webhook` or `venmo-import` here.
 */
export interface RecordInvoicePaymentRequest {
  id: string;
  source: ManualInvoicePaymentSource;
  /** Optional memo — e.g. the payer's Venmo handle or a confirmation note. */
  note?: string;
}

export interface RecordInvoicePaymentResponse {
  invoice: Invoice;
}

// ============================================================================
// Delete Invoice
// ============================================================================

export interface DeleteInvoiceRequest {
  id: string;
}

export interface DeleteInvoiceResponse {
  success: boolean;
}
