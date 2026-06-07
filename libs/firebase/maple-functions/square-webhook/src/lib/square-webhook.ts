/**
 * Square Webhook Handler
 *
 * Handles incoming webhooks from Square for:
 * - catalog.version.updated: a catalog edit happened in Square. The
 *   actual catalog re-sync runs asynchronously in
 *   `processCatalogSyncRequest`; this handler just records a request
 *   and returns 200 well within Square's 10-second delivery timeout.
 *   See `CatalogSyncRequestRepository`.
 * - inventory.count.updated: targeted per-variation update; fast
 *   enough to run inline.
 * - invoice.payment_made: single-record status flip; inline.
 *
 * With separate Firebase projects, each project has its own webhook signature key:
 * - maple-and-spruce-dev: sandbox webhook signature key
 * - maple-and-spruce: production webhook signature key
 *
 * @see https://developer.squareup.com/docs/webhooks/overview
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createHmac } from 'crypto';
import {
  CatalogSyncRequestRepository,
  InvoiceRepository,
  ProductRepository,
} from '@maple/firebase/database';
import { FirebaseProject } from '@maple/firebase/functions';

// Webhook event types we handle
type WebhookEventType =
  | 'catalog.version.updated'
  | 'inventory.count.updated'
  | 'invoice.payment_made';

interface WebhookEvent {
  merchant_id: string;
  type: WebhookEventType;
  event_id: string;
  created_at: string;
  data: {
    type: string;
    id: string;
    object?: Record<string, unknown>;
  };
}

/**
 * Verify Square webhook signature
 *
 * @see https://developer.squareup.com/docs/webhooks/step3validate
 */
function verifySignature(
  body: string,
  signature: string | undefined,
  signatureKey: string,
  webhookUrl: string
): boolean {
  if (!signature) {
    console.warn('No signature provided in webhook request');
    return false;
  }

  // Square signature format: webhookUrl + body, HMAC-SHA256, base64
  const stringToSign = webhookUrl + body;
  const expectedSignature = createHmac('sha256', signatureKey)
    .update(stringToSign)
    .digest('base64');

  return signature === expectedSignature;
}

/**
 * Handle catalog.version.updated webhook
 *
 * Square sends this every time the catalog version changes — for bulk
 * POS or Dashboard edits, that's a burst of events in seconds. The
 * actual re-sync is O(catalog size) and far exceeds Square's 10-second
 * delivery deadline, so we defer: bump the singleton request doc and
 * let the Firestore-triggered processor coalesce + run the work.
 */
export async function handleCatalogUpdate(): Promise<{
  action: string;
  details: string;
}> {
  await CatalogSyncRequestRepository.requestRefresh();
  return {
    action: 'enqueued',
    details:
      'catalogSyncRequests/pending bumped; processCatalogSyncRequest will run the sync',
  };
}

/**
 * Handle inventory.count.updated webhook
 *
 * Fired when inventory quantity changes in Square (sale, adjustment, etc.)
 *
 * Payload structure:
 * {
 *   "data": {
 *     "object": {
 *       "inventory_counts": [
 *         { "catalog_object_id": "...", "quantity": "9", "location_id": "...", "state": "IN_STOCK" }
 *       ]
 *     }
 *   }
 * }
 */
export async function handleInventoryUpdate(
  event: WebhookEvent
): Promise<{ action: string; details: string }> {
  // The inventory counts are nested inside object.inventory_counts array
  const inventoryData = event.data.object as {
    inventory_counts?: Array<{
      catalog_object_id?: string;
      quantity?: string;
      location_id?: string;
      state?: string;
    }>;
  } | undefined;

  const inventoryCounts = inventoryData?.inventory_counts;

  if (!inventoryCounts || inventoryCounts.length === 0) {
    return {
      action: 'skipped',
      details: 'No inventory_counts in event',
    };
  }

  // Process each inventory count update
  const products = await ProductRepository.findAll();
  const results: string[] = [];

  for (const count of inventoryCounts) {
    if (!count.catalog_object_id) {
      results.push('skipped (no catalog_object_id)');
      continue;
    }

    // Find the product by variation ID
    const product = products.find(
      (p) => p.squareVariationId === count.catalog_object_id
    );

    if (!product) {
      results.push(`skipped variation ${count.catalog_object_id} (not tracked)`);
      continue;
    }

    const newQuantity = parseInt(count.quantity || '0', 10);
    await ProductRepository.updateCachedQuantity(product.id, newQuantity);
    results.push(`${product.id}: ${newQuantity}`);
  }

  return {
    action: 'updated',
    details: `Inventory updates: ${results.join(', ')}`,
  };
}

/**
 * Handle invoice.payment_made webhook
 *
 * Fired when a customer completes payment on a Square invoice we sent.
 * Match by squareInvoiceId and flip our Firestore invoice to paid with
 * paymentRecord { source: 'square-webhook', squarePaymentId }.
 *
 * Payload shape (per Square docs):
 *   data.object.invoice.id                                → Square invoice id
 *   data.object.invoice.payment_requests[0]
 *     .completed_payment_ids[0]                           → Square payment id
 */
export async function handleInvoicePaymentMade(
  event: WebhookEvent
): Promise<{ action: string; details: string }> {
  const payload = event.data.object as
    | {
        invoice?: {
          id?: string;
          payment_requests?: Array<{
            completed_payment_ids?: string[];
          }>;
        };
      }
    | undefined;

  const squareInvoiceId = payload?.invoice?.id ?? event.data.id;
  const squarePaymentId =
    payload?.invoice?.payment_requests?.[0]?.completed_payment_ids?.[0] ??
    'unknown';

  if (!squareInvoiceId) {
    return {
      action: 'skipped',
      details: 'No invoice id in invoice.payment_made payload',
    };
  }

  const invoice = await InvoiceRepository.findBySquareInvoiceId(
    squareInvoiceId
  );

  if (!invoice) {
    return {
      action: 'skipped',
      details: `No Firestore invoice with squareInvoiceId ${squareInvoiceId}`,
    };
  }

  // Idempotent: already paid by a prior event → no-op.
  if (invoice.status === 'paid') {
    return {
      action: 'skipped',
      details: `Invoice ${invoice.id} already paid (idempotent)`,
    };
  }

  await InvoiceRepository.markPaidBySquareWebhook({
    id: invoice.id,
    squarePaymentId,
  });

  return {
    action: 'paid',
    details: `Invoice ${invoice.id} → paid (squarePaymentId=${squarePaymentId})`,
  };
}

// Webhook signature key is the only secret we need here. Catalog sync
// (which needs full Square credentials) runs in processCatalogSyncRequest.
const webhookSignatureKey = defineSecret('SQUARE_WEBHOOK_SIGNATURE_KEY');

/**
 * Square webhook endpoint
 *
 * Receives webhook events from Square and processes them.
 * Must be deployed and registered in Square Dashboard.
 *
 * Each Firebase project has its own webhook registered with Square:
 * - maple-and-spruce-dev: sandbox webhook
 * - maple-and-spruce: production webhook
 */
export const squareWebhook = onRequest(
  {
    region: 'us-east4',
    memory: '512MiB',
    concurrency: 10,
    secrets: [webhookSignatureKey],
  },
  async (request, response) => {
    // Only accept POST
    if (request.method !== 'POST') {
      response.status(405).send('Method not allowed');
      return;
    }

    try {
      // Get raw body for signature verification
      const rawBody = JSON.stringify(request.body);
      const signature = request.headers['x-square-hmacsha256-signature'] as string | undefined;

      // Get the webhook signature key - accessed at runtime, not cold start
      const signatureKey = webhookSignatureKey.value();

      // Get the webhook URL (needed for signature verification)
      // Use the notification URL exactly as registered in Square Dashboard
      const webhookUrl = FirebaseProject.functionUrl('squareWebhook');

      console.log('Signature verification:', {
        receivedSignature: signature,
        webhookUrl,
        bodyLength: rawBody.length,
        projectId: FirebaseProject.projectId,
      });

      // Verify signature
      if (!verifySignature(rawBody, signature, signatureKey, webhookUrl)) {
        console.error('Webhook signature verification failed');
        response.status(401).send('Invalid signature');
        return;
      }

      const event = request.body as WebhookEvent;
      console.log(`Received Square webhook: ${event.type} (${event.event_id})`);

      // Handle the event based on type
      let result: { action: string; details: string };

      switch (event.type) {
        case 'catalog.version.updated':
          result = await handleCatalogUpdate();
          break;

        case 'inventory.count.updated':
          result = await handleInventoryUpdate(event);
          break;

        case 'invoice.payment_made':
          result = await handleInvoicePaymentMade(event);
          break;

        default:
          result = {
            action: 'skipped',
            details: `Unhandled event type: ${event.type}`,
          };
      }

      console.log(`Webhook result: ${result.action} - ${result.details}`);

      // Always return 200 to acknowledge receipt (even for skipped events)
      // Square will retry if we return an error
      response.status(200).json({
        received: true,
        event_id: event.event_id,
        ...result,
      });
    } catch (error) {
      console.error('Webhook processing error:', error);

      // Return 500 so Square will retry
      response.status(500).json({
        error: error instanceof Error ? error.message : 'Internal error',
      });
    }
  }
);
