/**
 * Square API mock routes.
 *
 * Implements the Square API endpoints used by our functions:
 * - POST /v2/payments (create payment)
 * - POST /v2/refunds (refund payment)
 * - GET /v2/payments/:paymentId (get payment)
 * - POST /v2/catalog/batch-upsert (create/update catalog items)
 * - GET /v2/catalog/object/:objectId (get catalog item)
 * - DELETE /v2/catalog/object/:objectId (delete catalog item)
 */
import { MockServer } from '../mock-server.js';

let orderCounter = 0;
let paymentCounter = 0;
let refundCounter = 0;
let catalogCounter = 0;

/** In-memory store of created payments for get/refund lookups */
const payments = new Map<string, Record<string, unknown>>();

export function registerSquareRoutes(server: MockServer): void {
  // Create order (required before payment in registration flow)
  server.post('/v2/orders', (req) => {
    const body = req.body as Record<string, unknown>;
    orderCounter++;
    const orderId = `mock-order-${orderCounter}`;

    return {
      status: 200,
      body: {
        order: {
          id: orderId,
          location_id: (body['order'] as Record<string, unknown>)?.['location_id'] ?? 'mock-location',
          state: 'OPEN',
          total_money: { amount: 0, currency: 'USD' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    };
  });

  // Create payment
  server.post('/v2/payments', (req) => {
    const body = req.body as Record<string, unknown>;
    paymentCounter++;
    const paymentId = `mock-payment-${paymentCounter}`;

    const payment = {
      id: paymentId,
      status: 'COMPLETED',
      amount_money: body['amount_money'] ?? body['amountMoney'],
      source_type: 'CARD',
      card_details: {
        status: 'CAPTURED',
        card: {
          card_brand: 'VISA',
          last_4: '1111',
        },
      },
      receipt_url: `https://squareupsandbox.com/receipt/mock/${paymentId}`,
      order_id: `mock-order-${paymentCounter}`,
      reference_id: body['reference_id'] ?? body['referenceId'],
      location_id: body['location_id'] ?? body['locationId'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    payments.set(paymentId, payment);

    return {
      status: 200,
      body: { payment },
    };
  });

  // Get payment
  server.get('/v2/payments/:paymentId', (req) => {
    const payment = payments.get(req.params['paymentId']);
    if (!payment) {
      return {
        status: 404,
        body: {
          errors: [
            {
              category: 'INVALID_REQUEST_ERROR',
              code: 'NOT_FOUND',
              detail: `Payment ${req.params['paymentId']} not found`,
            },
          ],
        },
      };
    }
    return { status: 200, body: { payment } };
  });

  // Refund payment
  server.post('/v2/refunds', (req) => {
    const body = req.body as Record<string, unknown>;
    refundCounter++;
    const refundId = `mock-refund-${refundCounter}`;
    const paymentId =
      (body['payment_id'] as string) ?? (body['paymentId'] as string);

    // Mark the payment as refunded
    const payment = payments.get(paymentId);
    if (payment) {
      payment['status'] = 'COMPLETED';
      payment['refunded_money'] =
        body['amount_money'] ?? body['amountMoney'];
    }

    return {
      status: 200,
      body: {
        refund: {
          id: refundId,
          status: 'COMPLETED',
          payment_id: paymentId,
          amount_money: body['amount_money'] ?? body['amountMoney'],
          reason: body['reason'] ?? 'Requested by seller',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    };
  });

  // Catalog batch upsert
  server.post('/v2/catalog/batch-upsert', (req) => {
    const body = req.body as Record<string, unknown>;
    const batches = (body['batches'] as Array<Record<string, unknown>>) ?? [];
    const mappings: Array<Record<string, string>> = [];

    for (const batch of batches) {
      const objects =
        (batch['objects'] as Array<Record<string, unknown>>) ?? [];
      for (const obj of objects) {
        catalogCounter++;
        const clientId = (obj['id'] as string) ?? `#temp-${catalogCounter}`;
        const serverId = clientId.startsWith('#')
          ? `mock-catalog-${catalogCounter}`
          : clientId;
        mappings.push({
          client_object_id: clientId,
          object_id: serverId,
        });
      }
    }

    return {
      status: 200,
      body: {
        id_mappings: mappings,
      },
    };
  });

  // Get catalog object
  server.get('/v2/catalog/object/:objectId', () => {
    catalogCounter++;
    return {
      status: 200,
      body: {
        object: {
          type: 'ITEM',
          id: `mock-catalog-${catalogCounter}`,
          item_data: {
            name: 'Mock Catalog Item',
            variations: [],
          },
        },
      },
    };
  });

  // Delete catalog object
  server.delete('/v2/catalog/object/:objectId', (req) => {
    return {
      status: 200,
      body: {
        deleted_object_ids: [req.params['objectId']],
        deleted_at: new Date().toISOString(),
      },
    };
  });
}

/**
 * Reset Square mock state between tests.
 */
export function resetSquareState(): void {
  orderCounter = 0;
  paymentCounter = 0;
  refundCounter = 0;
  catalogCounter = 0;
  payments.clear();
}
