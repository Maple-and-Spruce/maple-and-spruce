/**
 * POS Sale Request domain type
 *
 * A queue doc, keyed by Square payment id, that the lean `squareWebhook`
 * handler enqueues on a COMPLETED `payment.created`/`payment.updated` event.
 * The `processPosSale` Firestore-triggered worker drains it: it fetches the
 * payment/order/customer from Square, dedups against web orders, and creates
 * a `source:'pos'` registration for each class line item.
 *
 * Doc-id = paymentId gives idempotency across Square's webhook retries (the
 * same payment enqueues the same doc).
 */
export interface PosSaleRequest {
  /** Square payment id — also the Firestore doc id. */
  paymentId: string;
  /** Square order id, if the webhook payload carried it. */
  orderId?: string;
  /** When the request was enqueued by the webhook. */
  requestedAt: Date;
  /** When the worker finished processing it (idempotency sentinel). */
  processedAt?: Date;
  /** Last error message, set when processing failed (does not set processedAt). */
  lastError?: string;
}
