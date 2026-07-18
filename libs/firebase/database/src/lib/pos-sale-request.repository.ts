/**
 * POS Sale Request Repository
 *
 * Queue collection at `posSaleRequests/{paymentId}` that decouples the lean
 * `squareWebhook` handler from the heavy POS class-registration work. On a
 * COMPLETED `payment.created`/`payment.updated` event the webhook enqueues a
 * doc here and acks fast (well within Square's 10-second delivery timeout);
 * the `processPosSale` Firestore trigger drains it.
 *
 * Doc-id = paymentId gives idempotency across Square's webhook retries: the
 * same payment always upserts the same doc rather than piling up duplicates.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { db, toDate } from './utilities/database.config';
import type { PosSaleRequest } from '@maple/ts/domain';

const COLLECTION = 'posSaleRequests';

function docToPosSaleRequest(
  doc: FirebaseFirestore.DocumentSnapshot
): PosSaleRequest | undefined {
  if (!doc.exists) {
    return undefined;
  }
  const data = doc.data()!;
  return {
    paymentId: data.paymentId ?? doc.id,
    orderId: data.orderId ?? undefined,
    requestedAt: data.requestedAt ? toDate(data.requestedAt) : new Date(0),
    processedAt: data.processedAt ? toDate(data.processedAt) : undefined,
    lastError: data.lastError ?? undefined,
  };
}

export const PosSaleRequestRepository = {
  /**
   * Enqueue (or re-stamp) a POS sale request for a completed payment. Merges
   * so a retried webhook delivery for the same payment id doesn't clobber a
   * `processedAt`/`lastError` already written by the worker.
   */
  async enqueue(
    paymentId: string,
    data: { orderId?: string }
  ): Promise<void> {
    await db
      .collection(COLLECTION)
      .doc(paymentId)
      .set(
        {
          paymentId,
          orderId: data.orderId ?? null,
          requestedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  },

  /** Mark the request processed (idempotency sentinel) and clear any prior error. */
  async markProcessed(paymentId: string): Promise<void> {
    await db
      .collection(COLLECTION)
      .doc(paymentId)
      .set(
        {
          processedAt: FieldValue.serverTimestamp(),
          lastError: FieldValue.delete(),
        },
        { merge: true }
      );
  },

  /** Record a processing failure. Does NOT set processedAt so the worker retries. */
  async markFailed(paymentId: string, message: string): Promise<void> {
    await db
      .collection(COLLECTION)
      .doc(paymentId)
      .set({ lastError: message }, { merge: true });
  },

  /** Read a request by payment id. */
  async findById(paymentId: string): Promise<PosSaleRequest | undefined> {
    const doc = await db.collection(COLLECTION).doc(paymentId).get();
    return docToPosSaleRequest(doc);
  },
};
