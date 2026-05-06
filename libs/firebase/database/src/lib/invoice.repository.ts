/**
 * Invoice Repository
 *
 * Private-pay music lesson invoices. See `invoice.ts` for status
 * transition rules — the repository applies issuedAt / paidAt stamps
 * automatically when status transitions into sent / paid.
 *
 * Paid transitions also stamp a `paymentRecord` so the admin can
 * attribute the payment to a specific event (admin-manual vs. the Square
 * `invoice.payment_made` webhook).
 */
import { db, toDate } from './utilities/database.config';
import type {
  Invoice,
  CreateInvoiceInput,
  InvoiceLineItem,
  InvoicePaymentRecord,
  InvoiceStatus,
  UpdateInvoiceInput,
} from '@maple/ts/domain';
import { computeInvoiceTotalCents } from '@maple/ts/domain';

const COLLECTION = 'invoices';

/**
 * gRPC NOT_FOUND status code — Firestore throws this from `update()` when
 * the target doc has been deleted. The `syncInvoiceToSquare` trigger fires
 * async after status transitions; if the invoice is deleted (test cleanup,
 * admin churn, rapid status flips) before Square responds, the writeback
 * here would otherwise crash the function.
 */
const GRPC_NOT_FOUND = 5;

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === GRPC_NOT_FOUND
  );
}

function docToInvoice(
  doc: FirebaseFirestore.DocumentSnapshot
): Invoice | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  const rawPaymentRecord = data.paymentRecord as
    | {
        source: InvoicePaymentRecord['source'];
        squarePaymentId?: string;
        recordedAt: unknown;
      }
    | undefined;

  return {
    id: doc.id,
    studentId: data.studentId,
    status: data.status,
    lineItems: (data.lineItems ?? []) as InvoiceLineItem[],
    totalCents: data.totalCents ?? 0,
    issuedAt: data.issuedAt ? toDate(data.issuedAt) : undefined,
    paidAt: data.paidAt ? toDate(data.paidAt) : undefined,
    paymentRecord: rawPaymentRecord
      ? {
          source: rawPaymentRecord.source,
          squarePaymentId: rawPaymentRecord.squarePaymentId,
          recordedAt: toDate(rawPaymentRecord.recordedAt),
        }
      : undefined,
    squareOrderId: data.squareOrderId,
    squareInvoiceId: data.squareInvoiceId,
    squareSyncError: data.squareSyncError,
    notes: data.notes,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Ensure every line has a computed subtotal so the totalCents math is honest. */
function withComputedSubtotals(
  lineItems: InvoiceLineItem[]
): InvoiceLineItem[] {
  return lineItems.map((line) => ({
    ...line,
    subtotalCents: Math.round(line.quantity * line.unitAmountCents),
  }));
}

export interface InvoiceFilters {
  studentId?: string;
  status?: InvoiceStatus;
}

export const InvoiceRepository = {
  async findAll(filters: InvoiceFilters = {}): Promise<Invoice[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters.studentId) {
      query = query.where('studentId', '==', filters.studentId);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToInvoice(doc))
      .filter((i): i is Invoice => i !== undefined);
  },

  async findById(id: string): Promise<Invoice | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToInvoice(doc);
  },

  /**
   * Find an invoice by the Square invoice id — used by the payment_made
   * webhook to look up the Firestore record that needs to flip to paid.
   */
  async findBySquareInvoiceId(
    squareInvoiceId: string
  ): Promise<Invoice | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('squareInvoiceId', '==', squareInvoiceId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToInvoice(snapshot.docs[0]);
  },

  async create(input: CreateInvoiceInput): Promise<Invoice> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();
    const status = input.status ?? 'draft';
    const lineItems = withComputedSubtotals(input.lineItems);
    const totalCents = computeInvoiceTotalCents(lineItems);

    const data = {
      studentId: input.studentId,
      status,
      lineItems,
      totalCents,
      notes: input.notes,
      // On unusual direct-to-sent/paid creates, stamp at the same moment
      // as the Firestore doc — normal flow starts as draft with these unset.
      issuedAt: status === 'sent' || status === 'paid' ? now : undefined,
      paidAt: status === 'paid' ? now : undefined,
      // Direct-to-paid creates imply manual admin attribution since no
      // Square event has fired yet.
      paymentRecord:
        status === 'paid'
          ? {
              source: 'admin-manual' as const,
              recordedAt: now,
            }
          : undefined,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      studentId: data.studentId,
      status,
      lineItems,
      totalCents,
      issuedAt: data.issuedAt,
      paidAt: data.paidAt,
      paymentRecord: data.paymentRecord,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    };
  },

  async update(
    input: UpdateInvoiceInput,
    existing: Invoice
  ): Promise<Invoice> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const nextLineItems = updates.lineItems
      ? withComputedSubtotals(updates.lineItems)
      : existing.lineItems;

    const nextTotalCents = updates.lineItems
      ? computeInvoiceTotalCents(nextLineItems)
      : existing.totalCents;

    const nextStatus = updates.status ?? existing.status;
    const now = new Date();

    // Apply transition side-effects:
    // - first time entering sent: stamp issuedAt
    // - first time entering paid: stamp paidAt (and issuedAt if not set) +
    //   attribute payment to admin-manual (webhook path uses a different method)
    let issuedAt = existing.issuedAt;
    let paidAt = existing.paidAt;
    let paymentRecord = existing.paymentRecord;

    if (nextStatus === 'sent' && !issuedAt) {
      issuedAt = now;
    }
    if (nextStatus === 'paid') {
      if (!issuedAt) issuedAt = now;
      if (!paidAt) paidAt = now;
      if (!paymentRecord) {
        paymentRecord = {
          source: 'admin-manual',
          recordedAt: now,
        };
      }
    }

    const payload: Record<string, unknown> = {
      status: nextStatus,
      lineItems: nextLineItems,
      totalCents: nextTotalCents,
      issuedAt,
      paidAt,
      paymentRecord,
      updatedAt: now,
    };

    if (updates.notes !== undefined) {
      payload.notes = updates.notes;
    }

    await docRef.update(payload);

    const updated = await docRef.get();
    const invoice = docToInvoice(updated);
    if (!invoice) {
      throw new Error(`Invoice ${id} not found after update`);
    }
    return invoice;
  },

  /**
   * Flip an invoice to paid from the Square `invoice.payment_made` webhook,
   * attributing the payment to Square. Idempotent — if the invoice is
   * already paid, leaves the earlier paymentRecord intact.
   */
  async markPaidBySquareWebhook(args: {
    id: string;
    squarePaymentId: string;
  }): Promise<Invoice> {
    const docRef = db.collection(COLLECTION).doc(args.id);
    const existingSnap = await docRef.get();
    const existing = docToInvoice(existingSnap);
    if (!existing) {
      throw new Error(`Invoice ${args.id} not found`);
    }

    // Idempotent: already paid → no-op return current state.
    if (existing.status === 'paid') {
      return existing;
    }

    const now = new Date();
    const payload: Record<string, unknown> = {
      status: 'paid' as InvoiceStatus,
      paidAt: existing.paidAt ?? now,
      issuedAt: existing.issuedAt ?? now,
      paymentRecord: {
        source: 'square-webhook' as const,
        squarePaymentId: args.squarePaymentId,
        recordedAt: now,
      },
      updatedAt: now,
    };

    await docRef.update(payload);

    const updated = await docRef.get();
    const invoice = docToInvoice(updated);
    if (!invoice) {
      throw new Error(`Invoice ${args.id} not found after webhook update`);
    }
    return invoice;
  },

  /**
   * Persist the Square ids stamped during a successful send, and clear
   * any prior sync error.
   */
  async markSquareSynced(args: {
    id: string;
    squareOrderId: string;
    squareInvoiceId: string;
  }): Promise<void> {
    try {
      await db.collection(COLLECTION).doc(args.id).update({
        squareOrderId: args.squareOrderId,
        squareInvoiceId: args.squareInvoiceId,
        squareSyncError: null,
        updatedAt: new Date(),
      });
    } catch (err) {
      if (isNotFoundError(err)) return;
      throw err;
    }
  },

  /**
   * Persist a Square sync error so the admin UI can surface it. The
   * invoice stays in whatever status it was in; only the error field is
   * updated.
   */
  async recordSquareSyncError(args: {
    id: string;
    error: string;
  }): Promise<void> {
    try {
      await db.collection(COLLECTION).doc(args.id).update({
        squareSyncError: args.error,
        updatedAt: new Date(),
      });
    } catch (err) {
      if (isNotFoundError(err)) return;
      throw err;
    }
  },

  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },
};
