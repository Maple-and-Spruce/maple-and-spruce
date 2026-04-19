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
// Delete Invoice
// ============================================================================

export interface DeleteInvoiceRequest {
  id: string;
}

export interface DeleteInvoiceResponse {
  success: boolean;
}
