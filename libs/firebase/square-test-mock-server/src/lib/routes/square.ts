/**
 * Square API mock routes.
 *
 * Implements the Square API endpoints used by our functions:
 * - POST /v2/orders (create order)
 * - POST /v2/payments (create payment)
 * - GET /v2/payments/:paymentId (get payment)
 * - POST /v2/refunds (refund payment)
 * - POST /v2/catalog/batch-upsert (create/update catalog items)
 * - GET /v2/catalog/object/:objectId (get catalog item)
 * - DELETE /v2/catalog/object/:objectId (delete catalog item)
 * - POST /v2/catalog/images (upload catalog image)
 * - POST /v2/inventory/changes/batch-create (set/adjust inventory)
 */
import { SquareMockServer } from '../square-mock-server';

let orderCounter = 0;
let paymentCounter = 0;
let refundCounter = 0;
let catalogCounter = 0;
let imageCounter = 0;
let inventoryChangeCounter = 0;
let customerCounter = 0;
let cardCounter = 0;
let subscriptionCounter = 0;

/** In-memory store of created payments for get/refund lookups */
const payments = new Map<string, Record<string, unknown>>();
/** Craft Club: subscriptions are stored so cancel can look them up. */
const subscriptions = new Map<string, Record<string, unknown>>();

export function registerSquareRoutes(server: SquareMockServer): void {
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
    const resolvedObjects: Array<Record<string, unknown>> = [];

    // Build a map of client temp ID -> server ID so nested references resolve.
    // The SDK serializes to snake_case, so item_data and variations use
    // snake_case keys in the request body.
    const idMap = new Map<string, string>();

    for (const batch of batches) {
      const objects =
        (batch['objects'] as Array<Record<string, unknown>>) ?? [];
      for (const obj of objects) {
        catalogCounter++;
        const clientId = (obj['id'] as string) ?? `#temp-${catalogCounter}`;
        const serverId = clientId.startsWith('#')
          ? `mock-catalog-${catalogCounter}`
          : clientId;
        idMap.set(clientId, serverId);
        mappings.push({
          client_object_id: clientId,
          object_id: serverId,
        });

        // Also map nested variation IDs (inside item_data.variations)
        const itemData = (obj['item_data'] ?? obj['itemData']) as Record<string, unknown> | undefined;
        const variations = (itemData?.['variations'] as Array<Record<string, unknown>>) ?? [];
        for (const v of variations) {
          catalogCounter++;
          const vClientId = (v['id'] as string) ?? `#temp-var-${catalogCounter}`;
          const vServerId = vClientId.startsWith('#')
            ? `mock-catalog-${catalogCounter}`
            : vClientId;
          idMap.set(vClientId, vServerId);
          mappings.push({
            client_object_id: vClientId,
            object_id: vServerId,
          });
        }
      }
    }

    // Build resolved objects with server IDs, preserving nested structure.
    for (const batch of batches) {
      const objects =
        (batch['objects'] as Array<Record<string, unknown>>) ?? [];
      for (const obj of objects) {
        const clientId = (obj['id'] as string) ?? '';
        const serverId = idMap.get(clientId) ?? clientId;
        const resolved: Record<string, unknown> = {
          ...obj,
          id: serverId,
          version: 1,
        };
        // Resolve nested variation IDs inside item_data (snake_case from SDK)
        const itemData = (obj['item_data'] ?? obj['itemData']) as Record<string, unknown> | undefined;
        if (itemData?.['variations']) {
          const variations = (
            itemData['variations'] as Array<Record<string, unknown>>
          ).map((v) => {
            const vClientId = (v['id'] as string) ?? '';
            return {
              ...v,
              id: idMap.get(vClientId) ?? vClientId,
            };
          });
          resolved['item_data'] = { ...itemData, variations };
          delete resolved['itemData'];
        }
        resolvedObjects.push(resolved);
      }
    }

    return {
      status: 200,
      body: {
        objects: resolvedObjects,
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

  // Upload catalog image
  // Square SDK sends multipart/form-data to POST /v2/catalog/images.
  // The mock ignores the multipart body and returns a canned image response.
  server.post('/v2/catalog/images', () => {
    imageCounter++;
    const imageId = `mock-image-${imageCounter}`;

    return {
      status: 200,
      body: {
        image: {
          type: 'IMAGE',
          id: imageId,
          image_data: {
            name: `mock-image-${imageCounter}.jpg`,
            url: `https://square-mock.example.com/images/${imageId}.jpg`,
          },
        },
      },
    };
  });

  // Batch create inventory changes
  // Square SDK sends POST to /v2/inventory/changes/batch-create
  server.post('/v2/inventory/changes/batch-create', (req) => {
    const body = req.body as Record<string, unknown>;
    const changes = (body['changes'] as Array<Record<string, unknown>>) ?? [];
    inventoryChangeCounter++;

    const counts = changes.map((change) => {
      const physicalCount = change['physical_count'] as Record<string, unknown> | undefined;
      const adjustment = change['adjustment'] as Record<string, unknown> | undefined;

      if (physicalCount) {
        return {
          catalog_object_id: physicalCount['catalog_object_id'],
          catalog_object_type: 'ITEM_VARIATION',
          location_id: physicalCount['location_id'],
          quantity: physicalCount['quantity'],
          state: physicalCount['state'] ?? 'IN_STOCK',
          calculated_at: new Date().toISOString(),
        };
      }

      if (adjustment) {
        return {
          catalog_object_id: adjustment['catalog_object_id'],
          catalog_object_type: 'ITEM_VARIATION',
          location_id: adjustment['location_id'],
          quantity: adjustment['quantity'],
          state: adjustment['to_state'] ?? 'IN_STOCK',
          calculated_at: new Date().toISOString(),
        };
      }

      return {};
    });

    return {
      status: 200,
      body: { counts },
    };
  });

  registerCraftClubRoutes(server);
  registerMockControlRoutes(server);
}

/**
 * Test-control endpoints under /_mock/*.
 *
 * The mock server runs in its own process, separate from the test runner, so
 * suites need an HTTP surface to reset state and read back the requests the
 * function process sent. Mirrors the Etsy mock's `/_mock/*` pattern. These
 * routes are prefixed with `_mock/` to stay obviously non-Square.
 */
function registerMockControlRoutes(server: SquareMockServer): void {
  // Clear recorded requests + reset in-memory catalog/inventory/payment state.
  server.post('/_mock/reset', () => {
    server.clearRequests();
    resetSquareState();
    return { status: 200, body: { ok: true } };
  });

  // Return the recorded requests as JSON so tests can assert on the actual
  // payloads the function sent to Square. Query filtering is done client-side
  // by the test (the handler has no access to the query string).
  server.get('/_mock/requests', () => {
    return { status: 200, body: { requests: server.requests } };
  });
}

/**
 * Craft Club routes: Square customers, cards on file, and subscriptions.
 * Split out to keep `registerSquareRoutes` readable.
 */
function registerCraftClubRoutes(server: SquareMockServer): void {
  // Search customers by email (upsert lookup). Default: none found → caller
  // proceeds to create. Returns an empty list so each test starts clean.
  server.post('/v2/customers/search', () => {
    return { status: 200, body: { customers: [] } };
  });

  // Create customer
  server.post('/v2/customers', (req) => {
    const body = req.body as Record<string, unknown>;
    customerCounter++;
    const id = `mock-customer-${customerCounter}`;
    const customer = {
      id,
      given_name: body['given_name'],
      family_name: body['family_name'],
      email_address: body['email_address'],
      phone_number: body['phone_number'],
      created_at: new Date().toISOString(),
    };
    return { status: 200, body: { customer } };
  });

  // Create card on file (from a Web Payments SDK nonce)
  server.post('/v2/cards', (req) => {
    const body = req.body as Record<string, unknown>;
    cardCounter++;
    const id = `ccof:mock-card-${cardCounter}`;
    const cardInput = (body['card'] as Record<string, unknown>) ?? {};
    const card = {
      id,
      card_brand: 'VISA',
      last_4: '1111',
      customer_id: cardInput['customer_id'],
      cardholder_name: cardInput['cardholder_name'],
      enabled: true,
    };
    return { status: 200, body: { card } };
  });

  // Create subscription
  server.post('/v2/subscriptions', (req) => {
    const body = req.body as Record<string, unknown>;
    subscriptionCounter++;
    const id = `mock-subscription-${subscriptionCounter}`;
    const subscription = {
      id,
      location_id: body['location_id'],
      plan_variation_id: body['plan_variation_id'],
      customer_id: body['customer_id'],
      card_id: body['card_id'],
      status: 'ACTIVE',
      charged_through_date: '2026-07-26',
      created_at: new Date().toISOString(),
    };
    subscriptions.set(id, subscription);
    return { status: 200, body: { subscription } };
  });

  // Cancel subscription (used by self-service management in a later phase)
  server.post('/v2/subscriptions/:subscriptionId/cancel', (req) => {
    const existing = subscriptions.get(req.params['subscriptionId']);
    const subscription = {
      ...(existing ?? { id: req.params['subscriptionId'] }),
      status: 'CANCELED',
      canceled_date: '2026-08-26',
    };
    subscriptions.set(req.params['subscriptionId'], subscription);
    return { status: 200, body: { subscription } };
  });

  // Update subscription (e.g. swap the card on file)
  server.put('/v2/subscriptions/:subscriptionId', (req) => {
    const body = req.body as Record<string, unknown>;
    const patch = (body['subscription'] as Record<string, unknown>) ?? {};
    const existing = subscriptions.get(req.params['subscriptionId']) ?? {
      id: req.params['subscriptionId'],
    };
    const subscription = { ...existing, ...patch };
    subscriptions.set(req.params['subscriptionId'], subscription);
    return { status: 200, body: { subscription } };
  });

  // Pause subscription (admin action)
  server.post('/v2/subscriptions/:subscriptionId/pause', (req) => {
    const existing = subscriptions.get(req.params['subscriptionId']) ?? {
      id: req.params['subscriptionId'],
    };
    const subscription = { ...existing, status: 'PAUSED' };
    subscriptions.set(req.params['subscriptionId'], subscription);
    return { status: 200, body: { subscription } };
  });

  // Resume subscription (admin action)
  server.post('/v2/subscriptions/:subscriptionId/resume', (req) => {
    const existing = subscriptions.get(req.params['subscriptionId']) ?? {
      id: req.params['subscriptionId'],
    };
    const subscription = { ...existing, status: 'ACTIVE' };
    subscriptions.set(req.params['subscriptionId'], subscription);
    return { status: 200, body: { subscription } };
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
  imageCounter = 0;
  inventoryChangeCounter = 0;
  customerCounter = 0;
  cardCounter = 0;
  subscriptionCounter = 0;
  payments.clear();
  subscriptions.clear();
}
