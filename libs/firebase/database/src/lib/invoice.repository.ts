/**
 * Invoice Repository
 *
 * Private-pay music lesson invoices. See `invoice.ts` for status
 * transition rules — the repository applies issuedAt / paidAt stamps
 * automatically when status transitions into sent / paid.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Invoice,
  CreateInvoiceInput,
  InvoiceLineItem,
  InvoiceStatus,
  UpdateInvoiceInput,
} from '@maple/ts/domain';
import { computeInvoiceTotalCents } from '@maple/ts/domain';

const COLLECTION = 'invoices';

function docToInvoice(
  doc: FirebaseFirestore.DocumentSnapshot
): Invoice | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    studentId: data.studentId,
    status: data.status,
    lineItems: (data.lineItems ?? []) as InvoiceLineItem[],
    totalCents: data.totalCents ?? 0,
    issuedAt: data.issuedAt ? toDate(data.issuedAt) : undefined,
    paidAt: data.paidAt ? toDate(data.paidAt) : undefined,
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
    // - first time entering paid: stamp paidAt (and issuedAt if not set)
    let issuedAt = existing.issuedAt;
    let paidAt = existing.paidAt;

    if (nextStatus === 'sent' && !issuedAt) {
      issuedAt = now;
    }
    if (nextStatus === 'paid') {
      if (!issuedAt) issuedAt = now;
      if (!paidAt) paidAt = now;
    }

    const payload: Record<string, unknown> = {
      status: nextStatus,
      lineItems: nextLineItems,
      totalCents: nextTotalCents,
      issuedAt,
      paidAt,
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

  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },
};
