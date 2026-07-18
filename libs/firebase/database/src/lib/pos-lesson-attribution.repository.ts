/**
 * POS Lesson Attribution Repository
 *
 * Queue of in-person Square POS lesson sales that need to be tied to a
 * student (`posLessonAttributions` collection). Written by `processPosSale`
 * when a configured lesson catalog item is rung up; resolved either
 * automatically (customer email → student) or by a human from the review
 * queue (#628).
 *
 * Doc-id is deterministic — `${paymentId}__${catalogObjectId}` — so a Square
 * webhook retry (which re-runs `processPosSale`) never creates a duplicate
 * queue entry for the same line item.
 */
import { db, toDate } from './utilities/database.config';
import type {
  CreatePosLessonAttributionInput,
  PosLessonAttribution,
  PosLessonAttributionStatus,
  PosLessonAttributionSummary,
} from '@maple/ts/domain';

const COLLECTION = 'posLessonAttributions';

/** Deterministic id so retries are idempotent. */
export function posLessonAttributionId(
  paymentId: string,
  catalogObjectId: string
): string {
  return `${paymentId}__${catalogObjectId}`;
}

function docToAttribution(
  doc: FirebaseFirestore.DocumentSnapshot
): PosLessonAttribution | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    squarePaymentId: data.squarePaymentId,
    squareOrderId: data.squareOrderId,
    catalogObjectId: data.catalogObjectId,
    itemName: data.itemName,
    quantity: data.quantity ?? 1,
    subtotalCents: data.subtotalCents ?? 0,
    amountPaidCents: data.amountPaidCents ?? 0,
    occurredAt: toDate(data.occurredAt),
    squareReceiptUrl: data.squareReceiptUrl,
    squareCustomerId: data.squareCustomerId,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    status: data.status,
    studentId: data.studentId,
    invoiceId: data.invoiceId,
    attributedBy: data.attributedBy,
    attributedAt: data.attributedAt ? toDate(data.attributedAt) : undefined,
    notes: data.notes,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export const PosLessonAttributionRepository = {
  /**
   * List attributions, optionally by status. Sorted newest-first in memory so
   * a status filter needs no composite index (volume is low).
   */
  async findAll(filters: { status?: PosLessonAttributionStatus } = {}): Promise<
    PosLessonAttribution[]
  > {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToAttribution(doc))
      .filter((a): a is PosLessonAttribution => a !== undefined)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  },

  async findById(id: string): Promise<PosLessonAttribution | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToAttribution(doc);
  },

  /**
   * Capture a POS lesson sale. Idempotent on the deterministic id — a retried
   * webhook returns the existing record rather than duplicating it. Optionally
   * created already-`attributed` when the caller resolved a student inline
   * (the auto-attribution path).
   */
  async capture(
    input: CreatePosLessonAttributionInput,
    attribution?: {
      status: Extract<PosLessonAttributionStatus, 'pending' | 'attributed'>;
      studentId?: string;
      invoiceId?: string;
      attributedBy?: string;
    }
  ): Promise<PosLessonAttribution> {
    const id = posLessonAttributionId(
      input.squarePaymentId,
      input.catalogObjectId
    );
    const docRef = db.collection(COLLECTION).doc(id);
    const existing = await docRef.get();
    if (existing.exists) {
      return docToAttribution(existing)!;
    }

    const now = new Date();
    const status = attribution?.status ?? 'pending';
    const data = {
      ...input,
      occurredAt: input.occurredAt,
      status,
      studentId: attribution?.studentId,
      invoiceId: attribution?.invoiceId,
      attributedBy: attribution?.attributedBy,
      attributedAt: status === 'attributed' ? now : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await docRef.set(data);
    return docToAttribution(await docRef.get())!;
  },

  /** Mark an attribution resolved to a student + invoice (manual path, PR 2). */
  async attribute(args: {
    id: string;
    studentId: string;
    invoiceId: string;
    attributedBy: string;
  }): Promise<PosLessonAttribution> {
    const docRef = db.collection(COLLECTION).doc(args.id);
    await docRef.update({
      status: 'attributed' as PosLessonAttributionStatus,
      studentId: args.studentId,
      invoiceId: args.invoiceId,
      attributedBy: args.attributedBy,
      attributedAt: new Date(),
      updatedAt: new Date(),
    });
    const updated = docToAttribution(await docRef.get());
    if (!updated) throw new Error(`Attribution ${args.id} not found after update`);
    return updated;
  },

  /** Dismiss an attribution (e.g. refunded, or not actually a lesson). */
  async dismiss(args: {
    id: string;
    dismissedBy: string;
    notes?: string;
  }): Promise<PosLessonAttribution> {
    const docRef = db.collection(COLLECTION).doc(args.id);
    const updates: Record<string, unknown> = {
      status: 'dismissed' as PosLessonAttributionStatus,
      attributedBy: args.dismissedBy,
      attributedAt: new Date(),
      updatedAt: new Date(),
    };
    if (args.notes !== undefined) updates.notes = args.notes;
    await docRef.update(updates);
    const updated = docToAttribution(await docRef.get());
    if (!updated) throw new Error(`Attribution ${args.id} not found after update`);
    return updated;
  },

  async getSummary(): Promise<PosLessonAttributionSummary> {
    const all = await this.findAll();
    const summary: PosLessonAttributionSummary = {
      pending: 0,
      attributed: 0,
      dismissed: 0,
    };
    for (const a of all) summary[a.status]++;
    return summary;
  },
};
