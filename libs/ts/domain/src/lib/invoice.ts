/**
 * Invoice domain types
 *
 * Private-pay invoices for music lesson students. Hope Scholarship
 * students are invoiced externally via the EMA portal and must NOT flow
 * through this entity (guarded at the cloud-function layer, see #282).
 *
 * Line items are inlined on the invoice document rather than sub-collected
 * — invoices typically have at most a few dozen lines, and bundling keeps
 * the read path cheap for the admin list view.
 *
 * Status transitions allowed:
 *   draft  → sent   (stamps issuedAt)
 *   sent   → paid   (stamps paidAt)
 *   draft  → void
 *   sent   → void
 *   paid   → void   (for refunds — refunds themselves are out of scope)
 *
 * `paid` and `void` are otherwise terminal. Drafts may be edited or
 * hard-deleted; sent/paid/void may not be hard-deleted (use `void` to
 * cancel while preserving history).
 */

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export const INVOICE_STATUSES: InvoiceStatus[] = [
  'draft',
  'sent',
  'paid',
  'void',
];

export interface InvoiceLineItem {
  /** Client-generated stable id so edits can target the right line. */
  id: string;
  description: string;
  /** Optional FK to the lesson this line covers (when inserted via the
   *  lesson picker); free-form lines leave this unset. */
  lessonId?: string;
  quantity: number;
  unitAmountCents: number;
  subtotalCents: number;
}

/**
 * How the invoice became `paid`. Stamped by the server on the transition
 * into paid so the admin UI can attribute the payment to a specific event
 * (customer paid via Square vs. Katie flipped the switch manually).
 */
export type InvoicePaymentSource = 'admin-manual' | 'square-webhook';

export interface InvoicePaymentRecord {
  source: InvoicePaymentSource;
  /** Square payment id when the payment came in via the Square webhook. */
  squarePaymentId?: string;
  /** When the payment was recorded (distinct from paidAt which is the
   *  invoice status transition timestamp — typically the same but the
   *  two can differ if the webhook is delayed). */
  recordedAt: Date;
}

export interface Invoice {
  id: string;
  studentId: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  /** Server-computed from lineItems; do not include in write requests. */
  totalCents: number;
  /** Set on the transition draft → sent. */
  issuedAt?: Date;
  /** Set on the transition sent → paid. */
  paidAt?: Date;
  /** How the payment was recorded. Present only for paid invoices. */
  paymentRecord?: InvoicePaymentRecord;
  /** Square Order id created during the sent transition (source of line items in Square). */
  squareOrderId?: string;
  /** Square Invoice id created during the sent transition. */
  squareInvoiceId?: string;
  /**
   * Last Square sync error, if any. Set by the Firestore trigger when it
   * can't successfully send/cancel the Square invoice; cleared on the
   * next successful sync. Admin surfaces this so Katie can retry.
   */
  squareSyncError?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new invoice. Server stamps totalCents + timestamps. */
export type CreateInvoiceInput = {
  studentId: string;
  status?: InvoiceStatus; // defaults to 'draft' server-side
  lineItems: InvoiceLineItem[];
  notes?: string;
};

/** Input for updating an invoice. Partial everything except id. */
export type UpdateInvoiceInput = {
  id: string;
  status?: InvoiceStatus;
  lineItems?: InvoiceLineItem[];
  notes?: string;
};

/**
 * Compute a single line's subtotal. Truncates fractional cents to match
 * how we'd round currency anyway.
 */
export function computeLineSubtotal(line: {
  quantity: number;
  unitAmountCents: number;
}): number {
  return Math.round(line.quantity * line.unitAmountCents);
}

/** Sum line subtotals into the invoice total. */
export function computeInvoiceTotalCents(
  lineItems: Array<{ quantity: number; unitAmountCents: number }>
): number {
  return lineItems.reduce(
    (sum, line) => sum + computeLineSubtotal(line),
    0
  );
}

/**
 * Validate a status transition; returns true if allowed. This is the
 * source of truth — both server-side guards and UI enablement should use
 * it so the rules can't drift.
 */
export function isInvoiceStatusTransitionAllowed(
  from: InvoiceStatus,
  to: InvoiceStatus
): boolean {
  if (from === to) return true;

  switch (from) {
    case 'draft':
      return to === 'sent' || to === 'void';
    case 'sent':
      return to === 'paid' || to === 'void' || to === 'draft';
    case 'paid':
      return to === 'void';
    case 'void':
      return false;
    default:
      return false;
  }
}

/** Invoices are hard-deletable only while still a draft. */
export function isInvoiceDeletable(invoice: Pick<Invoice, 'status'>): boolean {
  return invoice.status === 'draft';
}
