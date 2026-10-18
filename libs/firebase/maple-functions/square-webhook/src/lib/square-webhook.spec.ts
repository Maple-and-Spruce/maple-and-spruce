import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  applySquareRefundToRegistration,
  type Registration,
  type SquareRefundInput,
} from '@maple/ts/domain';

/**
 * Tests for square-webhook.ts inventory handling
 *
 * Focuses on the handleInventoryUpdate function which processes
 * inventory.count.updated webhook events from Square.
 */

// Define mocks using vi.hoisted
const mocks = vi.hoisted(() => {
  return {
    findAll: vi.fn(),
    findBySquareItemId: vi.fn(),
    updateCachedQuantity: vi.fn(),
    updateSquareCache: vi.fn(),
    createProduct: vi.fn(),
    findBySquareInvoiceId: vi.fn(),
    markPaidBySquareWebhook: vi.fn(),
    requestRefresh: vi.fn(),
    findBySubscriptionId: vi.fn(),
    craftClubUpdate: vi.fn(),
    posEnqueue: vi.fn(),
    findBySquarePaymentId: vi.fn(),
    findBySquareOrderId: vi.fn(),
    applySquareRefund: vi.fn(),
  };
});

// Mock ProductRepository + InvoiceRepository + CatalogSyncRequestRepository
vi.mock('@maple/firebase/database', () => ({
  ProductRepository: {
    findAll: mocks.findAll,
    findBySquareItemId: mocks.findBySquareItemId,
    updateCachedQuantity: mocks.updateCachedQuantity,
    updateSquareCache: mocks.updateSquareCache,
    create: mocks.createProduct,
  },
  InvoiceRepository: {
    findBySquareInvoiceId: mocks.findBySquareInvoiceId,
    markPaidBySquareWebhook: mocks.markPaidBySquareWebhook,
  },
  CatalogSyncRequestRepository: {
    requestRefresh: mocks.requestRefresh,
  },
  CraftClubMemberRepository: {
    findBySubscriptionId: mocks.findBySubscriptionId,
    update: mocks.craftClubUpdate,
  },
  PosSaleRequestRepository: {
    enqueue: mocks.posEnqueue,
  },
  RegistrationRepository: {
    findBySquarePaymentId: mocks.findBySquarePaymentId,
    findBySquareOrderId: mocks.findBySquareOrderId,
    applySquareRefund: mocks.applySquareRefund,
  },
}));

// Mock firebase-functions params
vi.mock('firebase-functions/params', () => ({
  defineSecret: vi.fn().mockReturnValue({ value: () => 'mock-secret' }),
  defineString: vi.fn().mockReturnValue({ value: () => 'mock-string' }),
}));

// Mock FirebaseProject
vi.mock('@maple/firebase/functions', () => ({
  FirebaseProject: {
    functionUrl: vi.fn().mockReturnValue('https://mock-url.com/squareWebhook'),
    isDev: false,
    projectId: 'mock-project',
  },
}));

// Mock firebase-functions/v2/https — return the handler directly so we
// can invoke squareWebhook as a plain function.
vi.mock('firebase-functions/v2/https', () => ({
  onRequest: vi.fn((_config, handler) => handler),
}));

describe('Square Webhook - Inventory Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('inventory.count.updated event parsing', () => {
    it('correctly extracts inventory counts from nested payload structure', async () => {
      // This is the actual Square payload structure (the bug was parsing this wrong)
      const webhookPayload = {
        merchant_id: 'ML1TB2DX6N1B0',
        type: 'inventory.count.updated',
        event_id: 'd9b875f7-9e31-38d6-bf94-c018f59ab2fe',
        created_at: '2026-01-25T23:26:34.249537407Z',
        data: {
          type: 'inventory_counts',
          id: 'a8c7a224-bc21-4eb0-acfa-43ba09acd52b',
          object: {
            inventory_counts: [
              {
                calculated_at: '2026-01-25T23:26:34.221Z',
                catalog_object_id: 'MDAQ4KT52QCLJK7MWJMEGOWG',
                catalog_object_type: 'ITEM_VARIATION',
                location_id: 'LW0MMBZ5721QY',
                quantity: '9',
                state: 'IN_STOCK',
              },
            ],
          },
        },
      };

      // Verify the payload structure matches what we expect
      const inventoryData = webhookPayload.data.object as {
        inventory_counts?: Array<{
          catalog_object_id?: string;
          quantity?: string;
          location_id?: string;
          state?: string;
        }>;
      };

      const inventoryCounts = inventoryData?.inventory_counts;

      expect(inventoryCounts).toBeDefined();
      expect(inventoryCounts).toHaveLength(1);
      expect(inventoryCounts![0].catalog_object_id).toBe('MDAQ4KT52QCLJK7MWJMEGOWG');
      expect(inventoryCounts![0].quantity).toBe('9');
    });

    it('handles empty inventory_counts array gracefully', () => {
      const webhookPayload = {
        data: {
          object: {
            inventory_counts: [],
          },
        },
      };

      const inventoryData = webhookPayload.data.object as {
        inventory_counts?: Array<{ catalog_object_id?: string }>;
      };

      const inventoryCounts = inventoryData?.inventory_counts;

      expect(inventoryCounts).toBeDefined();
      expect(inventoryCounts).toHaveLength(0);
    });

    it('handles missing inventory_counts key gracefully', () => {
      const webhookPayload = {
        data: {
          object: {},
        },
      };

      const inventoryData = webhookPayload.data.object as {
        inventory_counts?: Array<{ catalog_object_id?: string }>;
      };

      const inventoryCounts = inventoryData?.inventory_counts;

      expect(inventoryCounts).toBeUndefined();
    });

    it('handles multiple inventory count updates in single event', () => {
      const webhookPayload = {
        data: {
          object: {
            inventory_counts: [
              {
                catalog_object_id: 'VAR_001',
                quantity: '5',
              },
              {
                catalog_object_id: 'VAR_002',
                quantity: '10',
              },
              {
                catalog_object_id: 'VAR_003',
                quantity: '0',
              },
            ],
          },
        },
      };

      const inventoryData = webhookPayload.data.object as {
        inventory_counts?: Array<{
          catalog_object_id?: string;
          quantity?: string;
        }>;
      };

      const inventoryCounts = inventoryData?.inventory_counts;

      expect(inventoryCounts).toHaveLength(3);
      expect(inventoryCounts![0].quantity).toBe('5');
      expect(inventoryCounts![1].quantity).toBe('10');
      expect(inventoryCounts![2].quantity).toBe('0');
    });

    it('parses quantity string to integer correctly', () => {
      const quantityString = '9';
      const parsedQuantity = parseInt(quantityString || '0', 10);

      expect(parsedQuantity).toBe(9);
      expect(typeof parsedQuantity).toBe('number');
    });

    it('defaults to 0 for missing quantity', () => {
      const quantityString = undefined;
      const parsedQuantity = parseInt(quantityString || '0', 10);

      expect(parsedQuantity).toBe(0);
    });
  });

  describe('product lookup by variation ID', () => {
    it('finds product by squareVariationId', async () => {
      const mockProducts = [
        {
          id: 'prod-001',
          squareItemId: 'ITEM_001',
          squareVariationId: 'VAR_001',
        },
        {
          id: 'prod-002',
          squareItemId: 'ITEM_002',
          squareVariationId: 'VAR_002',
        },
      ];

      mocks.findAll.mockResolvedValue(mockProducts);

      const products = await mocks.findAll();
      const product = products.find(
        (p: { squareVariationId: string }) => p.squareVariationId === 'VAR_001'
      );

      expect(product).toBeDefined();
      expect(product.id).toBe('prod-001');
    });

    it('returns undefined when variation ID not found', async () => {
      const mockProducts = [
        {
          id: 'prod-001',
          squareVariationId: 'VAR_001',
        },
      ];

      mocks.findAll.mockResolvedValue(mockProducts);

      const products = await mocks.findAll();
      const product = products.find(
        (p: { squareVariationId: string }) => p.squareVariationId === 'VAR_NONEXISTENT'
      );

      expect(product).toBeUndefined();
    });
  });

  describe('quantity update', () => {
    it('calls updateCachedQuantity with correct parameters', async () => {
      mocks.updateCachedQuantity.mockResolvedValue(undefined);

      await mocks.updateCachedQuantity('prod-001', 9);

      expect(mocks.updateCachedQuantity).toHaveBeenCalledWith('prod-001', 9);
    });
  });
});

describe('Square Webhook - invoice.payment_made handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** Realistic-ish Square invoice.payment_made payload. */
  const makeEvent = (
    squareInvoiceId: string,
    squarePaymentId: string
  ) => ({
    merchant_id: 'ML1TB2DX6N1B0',
    type: 'invoice.payment_made' as const,
    event_id: 'evt-1',
    created_at: '2026-04-23T14:00:00Z',
    data: {
      type: 'invoice',
      id: squareInvoiceId,
      object: {
        invoice: {
          id: squareInvoiceId,
          payment_requests: [
            {
              completed_payment_ids: [squarePaymentId],
            },
          ],
        },
      },
    },
  });

  it('flips a matching Firestore invoice to paid with square-webhook attribution', async () => {
    mocks.findBySquareInvoiceId.mockResolvedValue({
      id: 'firebase-inv-1',
      status: 'sent',
    });
    mocks.markPaidBySquareWebhook.mockResolvedValue({ id: 'firebase-inv-1' });

    const { handleInvoicePaymentMade } = await import('./square-webhook');
    const result = await handleInvoicePaymentMade(
      makeEvent('SQ-INV-1', 'SQ-PAY-1')
    );

    expect(mocks.findBySquareInvoiceId).toHaveBeenCalledWith('SQ-INV-1');
    expect(mocks.markPaidBySquareWebhook).toHaveBeenCalledWith({
      id: 'firebase-inv-1',
      squarePaymentId: 'SQ-PAY-1',
    });
    expect(result.action).toBe('paid');
  });

  it('is idempotent when the invoice is already paid', async () => {
    mocks.findBySquareInvoiceId.mockResolvedValue({
      id: 'firebase-inv-2',
      status: 'paid',
    });

    const { handleInvoicePaymentMade } = await import('./square-webhook');
    const result = await handleInvoicePaymentMade(
      makeEvent('SQ-INV-2', 'SQ-PAY-2')
    );

    expect(mocks.markPaidBySquareWebhook).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
    expect(result.details).toMatch(/already paid/i);
  });

  it('skips gracefully when no matching Firestore invoice exists', async () => {
    mocks.findBySquareInvoiceId.mockResolvedValue(undefined);

    const { handleInvoicePaymentMade } = await import('./square-webhook');
    const result = await handleInvoicePaymentMade(
      makeEvent('SQ-INV-UNKNOWN', 'SQ-PAY-3')
    );

    expect(mocks.markPaidBySquareWebhook).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
  });

  it('falls back to "unknown" when no completed_payment_ids in payload', async () => {
    mocks.findBySquareInvoiceId.mockResolvedValue({
      id: 'firebase-inv-3',
      status: 'sent',
    });
    mocks.markPaidBySquareWebhook.mockResolvedValue({ id: 'firebase-inv-3' });

    const event = {
      merchant_id: 'ML1TB2DX6N1B0',
      type: 'invoice.payment_made' as const,
      event_id: 'evt-4',
      created_at: '2026-04-23T14:00:00Z',
      data: {
        type: 'invoice',
        id: 'SQ-INV-3',
        object: {
          invoice: { id: 'SQ-INV-3' }, // no payment_requests
        },
      },
    };

    const { handleInvoicePaymentMade } = await import('./square-webhook');
    await handleInvoicePaymentMade(event);

    expect(mocks.markPaidBySquareWebhook).toHaveBeenCalledWith({
      id: 'firebase-inv-3',
      squarePaymentId: 'unknown',
    });
  });
});

describe('Square Webhook - handleCatalogUpdate (enqueue path)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The catalog handler no longer performs a sync inline — it bumps the
  // singleton `catalogSyncRequests/pending` doc and returns. The actual
  // sync runs in `processCatalogSyncRequest` (separate cloud function).
  // Tests for the sync work itself live in
  // `process-catalog-sync-request.spec.ts`.

  it('enqueues a sync request and returns immediately', async () => {
    mocks.requestRefresh.mockResolvedValue(undefined);

    const { handleCatalogUpdate } = await import('./square-webhook');
    const result = await handleCatalogUpdate();

    expect(mocks.requestRefresh).toHaveBeenCalledTimes(1);
    expect(result.action).toBe('enqueued');
  });

  it('propagates Firestore errors so the webhook returns 500 and Square retries', async () => {
    mocks.requestRefresh.mockRejectedValue(new Error('Firestore unavailable'));

    const { handleCatalogUpdate } = await import('./square-webhook');
    await expect(handleCatalogUpdate()).rejects.toThrow('Firestore unavailable');
  });
});

describe('Square Webhook - handleInventoryUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeInventoryEvent = (
    counts: Array<{
      catalog_object_id?: string;
      quantity?: string;
      location_id?: string;
      state?: string;
    }>
  ) => ({
    merchant_id: 'ML1TB2DX6N1B0',
    type: 'inventory.count.updated' as const,
    event_id: 'evt-inv',
    created_at: '2026-04-23T14:00:00Z',
    data: {
      type: 'inventory_counts',
      id: 'a8c7a224',
      object: { inventory_counts: counts },
    },
  });

  it('updates cached quantity for each tracked variation', async () => {
    mocks.findAll.mockResolvedValue([
      {
        id: 'prod-001',
        squareItemId: 'ITEM_001',
        squareVariationId: 'VAR_A',
      },
      {
        id: 'prod-002',
        squareItemId: 'ITEM_002',
        squareVariationId: 'VAR_B',
      },
    ]);
    mocks.updateCachedQuantity.mockResolvedValue(undefined);

    const { handleInventoryUpdate } = await import('./square-webhook');
    const result = await handleInventoryUpdate(
      makeInventoryEvent([
        { catalog_object_id: 'VAR_A', quantity: '5', state: 'IN_STOCK' },
        { catalog_object_id: 'VAR_B', quantity: '9', state: 'IN_STOCK' },
      ])
    );

    expect(mocks.updateCachedQuantity).toHaveBeenCalledWith('prod-001', 5);
    expect(mocks.updateCachedQuantity).toHaveBeenCalledWith('prod-002', 9);
    expect(result.action).toBe('updated');
  });

  it('skips variations that we do not track (no product match)', async () => {
    mocks.findAll.mockResolvedValue([
      {
        id: 'prod-001',
        squareItemId: 'ITEM_001',
        squareVariationId: 'VAR_A',
      },
    ]);

    const { handleInventoryUpdate } = await import('./square-webhook');
    const result = await handleInventoryUpdate(
      makeInventoryEvent([
        { catalog_object_id: 'VAR_UNKNOWN', quantity: '5' },
      ])
    );

    expect(mocks.updateCachedQuantity).not.toHaveBeenCalled();
    expect(result.details).toMatch(/not tracked/);
  });

  it('skips counts with no catalog_object_id', async () => {
    mocks.findAll.mockResolvedValue([]);

    const { handleInventoryUpdate } = await import('./square-webhook');
    const result = await handleInventoryUpdate(
      makeInventoryEvent([{ quantity: '5' }])
    );

    expect(mocks.updateCachedQuantity).not.toHaveBeenCalled();
    expect(result.details).toMatch(/no catalog_object_id/);
  });

  it('returns skipped when inventory_counts is empty', async () => {
    const { handleInventoryUpdate } = await import('./square-webhook');
    const result = await handleInventoryUpdate(makeInventoryEvent([]));

    expect(result.action).toBe('skipped');
    expect(result.details).toMatch(/No inventory_counts/);
  });

  it('returns skipped when inventory_counts is absent entirely', async () => {
    const event = {
      merchant_id: 'ML1TB2DX6N1B0',
      type: 'inventory.count.updated' as const,
      event_id: 'evt',
      created_at: '2026-04-23T14:00:00Z',
      data: {
        type: 'inventory_counts',
        id: 'a',
        object: {}, // no inventory_counts key
      },
    };

    const { handleInventoryUpdate } = await import('./square-webhook');
    const result = await handleInventoryUpdate(event);

    expect(result.action).toBe('skipped');
  });

  it('defaults missing quantity to 0', async () => {
    mocks.findAll.mockResolvedValue([
      { id: 'prod-1', squareVariationId: 'VAR_A' },
    ]);

    const { handleInventoryUpdate } = await import('./square-webhook');
    await handleInventoryUpdate(
      makeInventoryEvent([{ catalog_object_id: 'VAR_A' }])
    );

    expect(mocks.updateCachedQuantity).toHaveBeenCalledWith('prod-1', 0);
  });
});

describe('Square Webhook - squareWebhook endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeReq(
    body: Record<string, unknown>,
    signature?: string,
    method = 'POST'
  ) {
    return {
      method,
      body,
      headers: signature
        ? { 'x-square-hmacsha256-signature': signature }
        : {},
    };
  }

  function makeRes() {
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    return res as unknown as {
      status: ReturnType<typeof vi.fn>;
      send: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
  }

  /** HMAC-SHA256 the same way the webhook verifier does. */
  async function signBody(body: Record<string, unknown>): Promise<string> {
    const { createHmac } = await import('crypto');
    return createHmac('sha256', 'mock-secret')
      .update('https://mock-url.com/squareWebhook' + JSON.stringify(body))
      .digest('base64');
  }

  it('rejects non-POST with 405', async () => {
    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (
      req: unknown,
      res: unknown
    ) => Promise<void>;
    const res = makeRes();
    await fn(makeReq({}, undefined, 'GET'), res);

    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('rejects requests with no signature with 401', async () => {
    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (
      req: unknown,
      res: unknown
    ) => Promise<void>;
    const res = makeRes();
    await fn(makeReq({ type: 'catalog.version.updated' }), res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects requests with a bad signature with 401', async () => {
    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (
      req: unknown,
      res: unknown
    ) => Promise<void>;
    const res = makeRes();
    await fn(makeReq({ type: 'catalog.version.updated' }, 'not-the-right-hmac'), res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('dispatches invoice.payment_made events to the invoice handler', async () => {
    mocks.findBySquareInvoiceId.mockResolvedValue({
      id: 'fb-inv-1',
      status: 'sent',
    });
    mocks.markPaidBySquareWebhook.mockResolvedValue({
      id: 'fb-inv-1',
      status: 'paid',
    });

    const body = {
      merchant_id: 'ML1',
      type: 'invoice.payment_made',
      event_id: 'evt-1',
      created_at: '2026-04-23T14:00:00Z',
      data: {
        type: 'invoice',
        id: 'SQ-INV-1',
        object: {
          invoice: {
            id: 'SQ-INV-1',
            payment_requests: [
              { completed_payment_ids: ['SQ-PAY-1'] },
            ],
          },
        },
      },
    };
    const sig = await signBody(body);

    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (
      req: unknown,
      res: unknown
    ) => Promise<void>;
    const res = makeRes();
    await fn(makeReq(body, sig), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.markPaidBySquareWebhook).toHaveBeenCalledWith({
      id: 'fb-inv-1',
      squarePaymentId: 'SQ-PAY-1',
    });
  });

  it('acknowledges unhandled event types with 200 skipped', async () => {
    const body = {
      merchant_id: 'ML1',
      type: 'some.unhandled.event',
      event_id: 'evt-2',
      created_at: '2026-04-23T14:00:00Z',
      data: { type: 'x', id: 'y' },
    };
    const sig = await signBody(body);

    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (
      req: unknown,
      res: unknown
    ) => Promise<void>;
    const res = makeRes();
    await fn(makeReq(body, sig), res);

    expect(res.status).toHaveBeenCalledWith(200);
    // json body should include action: 'skipped'
    const jsonArg = res.json.mock.calls[0][0];
    expect(jsonArg.action).toBe('skipped');
  });

  it('returns 500 when a handler throws (so Square retries)', async () => {
    // Force the invoice handler to throw by making the repository reject
    mocks.findBySquareInvoiceId.mockRejectedValue(
      new Error('Firestore unavailable')
    );

    const body = {
      merchant_id: 'ML1',
      type: 'invoice.payment_made',
      event_id: 'evt-3',
      created_at: '2026-04-23T14:00:00Z',
      data: {
        type: 'invoice',
        id: 'SQ-INV-X',
        object: { invoice: { id: 'SQ-INV-X' } },
      },
    };
    const sig = await signBody(body);

    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (
      req: unknown,
      res: unknown
    ) => Promise<void>;
    const res = makeRes();
    await fn(makeReq(body, sig), res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('Square Webhook - handlePaymentUpsert (POS enqueue path)', () => {
  beforeEach(() => vi.clearAllMocks());

  function paymentEvent(
    payment: Record<string, unknown> | undefined,
    type: 'payment.created' | 'payment.updated' = 'payment.updated'
  ) {
    return {
      merchant_id: 'ML1TB2DX6N1B0',
      type,
      event_id: 'evt-pay',
      created_at: '2026-07-11T10:00:00Z',
      data: {
        type: 'payment',
        id: (payment?.id as string) ?? 'PAY-DATA-ID',
        object: payment ? { payment } : {},
      },
    } as never;
  }

  it('enqueues a POS sale request for a COMPLETED payment', async () => {
    mocks.posEnqueue.mockResolvedValue(undefined);

    const { handlePaymentUpsert } = await import('./square-webhook');
    const result = await handlePaymentUpsert(
      paymentEvent({
        id: 'PAY-1',
        order_id: 'ORDER-1',
        status: 'COMPLETED',
      })
    );

    expect(mocks.posEnqueue).toHaveBeenCalledWith('PAY-1', {
      orderId: 'ORDER-1',
    });
    expect(result.action).toBe('enqueued');
    expect(result.details).toBe('PAY-1');
  });

  it('tolerates camelCase orderId in the payload', async () => {
    mocks.posEnqueue.mockResolvedValue(undefined);

    const { handlePaymentUpsert } = await import('./square-webhook');
    await handlePaymentUpsert(
      paymentEvent({ id: 'PAY-2', orderId: 'ORDER-2', status: 'COMPLETED' })
    );

    expect(mocks.posEnqueue).toHaveBeenCalledWith('PAY-2', {
      orderId: 'ORDER-2',
    });
  });

  it('skips (no enqueue) when the payment is not COMPLETED', async () => {
    const { handlePaymentUpsert } = await import('./square-webhook');
    const result = await handlePaymentUpsert(
      paymentEvent({ id: 'PAY-3', order_id: 'ORDER-3', status: 'APPROVED' })
    );

    expect(mocks.posEnqueue).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
    expect(result.details).toMatch(/not completed/i);
  });

  it('skips when there is no payment id', async () => {
    const { handlePaymentUpsert } = await import('./square-webhook');
    const result = await handlePaymentUpsert({
      merchant_id: 'm',
      type: 'payment.updated',
      event_id: 'evt',
      created_at: '2026-07-11T10:00:00Z',
      data: { type: 'payment', id: '', object: {} },
    } as never);

    expect(mocks.posEnqueue).not.toHaveBeenCalled();
    expect(result.action).toBe('skipped');
  });
});

describe('handleSubscriptionEvent', () => {
  beforeEach(() => vi.clearAllMocks());

  function subEvent(object: Record<string, unknown>) {
    return {
      merchant_id: 'm',
      type: 'subscription.updated',
      event_id: 'evt-sub',
      created_at: '2026-06-26',
      data: { type: 'subscription', id: 'sub-1', object },
    } as never;
  }

  it('reconciles a CANCELED subscription onto the member', async () => {
    mocks.findBySubscriptionId.mockResolvedValue({
      id: 'm1',
      status: 'active',
      currentPeriodEndsAt: undefined,
    });
    mocks.craftClubUpdate.mockResolvedValue({});

    const { handleSubscriptionEvent } = await import('./square-webhook');
    const result = await handleSubscriptionEvent(
      subEvent({
        subscription: {
          id: 'sub-1',
          status: 'CANCELED',
          charged_through_date: '2026-08-01',
        },
      })
    );

    expect(result.action).toBe('updated');
    expect(mocks.craftClubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm1',
        status: 'cancelled',
        cancelledAt: expect.any(Date),
        currentPeriodEndsAt: expect.any(Date),
      })
    );
  });

  it('maps PAUSED → paused', async () => {
    mocks.findBySubscriptionId.mockResolvedValue({ id: 'm1', status: 'active' });
    mocks.craftClubUpdate.mockResolvedValue({});

    const { handleSubscriptionEvent } = await import('./square-webhook');
    await handleSubscriptionEvent(
      subEvent({ subscription: { id: 'sub-1', status: 'PAUSED' } })
    );

    expect(mocks.craftClubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'm1', status: 'paused' })
    );
  });

  it('is idempotent — skips when nothing changed', async () => {
    mocks.findBySubscriptionId.mockResolvedValue({
      id: 'm1',
      status: 'active',
    });

    const { handleSubscriptionEvent } = await import('./square-webhook');
    const result = await handleSubscriptionEvent(
      subEvent({ subscription: { id: 'sub-1', status: 'ACTIVE' } })
    );

    expect(result.action).toBe('skipped');
    expect(mocks.craftClubUpdate).not.toHaveBeenCalled();
  });

  it('skips when no member matches the subscription', async () => {
    mocks.findBySubscriptionId.mockResolvedValue(undefined);

    const { handleSubscriptionEvent } = await import('./square-webhook');
    const result = await handleSubscriptionEvent(
      subEvent({ subscription: { id: 'sub-unknown', status: 'ACTIVE' } })
    );

    expect(result.action).toBe('skipped');
    expect(mocks.craftClubUpdate).not.toHaveBeenCalled();
  });
});

describe('handleRefundEvent (#144)', () => {
  /**
   * A stand-in for the Firestore transaction that runs the real domain rule
   * over an in-memory registration, so cumulative and duplicate refunds are
   * exercised end to end through the handler.
   */
  let stored: Registration;

  function confirmedRegistration(overrides: Partial<Registration> = {}): Registration {
    return {
      id: 'reg-1',
      classId: 'class-1',
      customerEmail: 'robin@example.com',
      customerName: 'Robin Ashfield',
      quantity: 1,
      pricePaidCents: 6360,
      subtotalCents: 6000,
      taxAmountCents: 360,
      taxRatePercent: 6,
      squarePaymentId: 'pay-1',
      squareOrderId: 'ord-1',
      status: 'confirmed',
      source: 'web',
      createdAt: new Date('2026-10-01T00:00:00Z'),
      updatedAt: new Date('2026-10-01T00:00:00Z'),
      ...overrides,
    };
  }

  function refundEvent(
    refund: Record<string, unknown>,
    type: 'refund.created' | 'refund.updated' = 'refund.updated'
  ) {
    return {
      merchant_id: 'ML1',
      type,
      event_id: `evt-${String(refund.id)}`,
      created_at: '2026-10-15T15:00:00Z',
      data: { type: 'refund', id: String(refund.id), object: { refund } },
    } as unknown as Parameters<typeof handleRefundEvent>[0];
  }

  function completed(id: string, amount: number, extra: Record<string, unknown> = {}) {
    return refundEvent({
      id,
      payment_id: 'pay-1',
      order_id: 'ord-1',
      amount_money: { amount, currency: 'USD' },
      status: 'COMPLETED',
      updated_at: '2026-10-15T15:00:00Z',
      ...extra,
    });
  }

  let handleRefundEvent: typeof import('./square-webhook').handleRefundEvent;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ handleRefundEvent } = await import('./square-webhook'));
    stored = confirmedRegistration();
    mocks.findBySquarePaymentId.mockImplementation(async (id: string) =>
      id === stored.squarePaymentId ? stored : undefined
    );
    mocks.findBySquareOrderId.mockImplementation(async (id: string) =>
      id === stored.squareOrderId ? stored : undefined
    );
    mocks.applySquareRefund.mockImplementation(
      async (_id: string, refund: SquareRefundInput) => {
        const result = applySquareRefundToRegistration(stored, refund);
        if (result.outcome !== 'duplicate') {
          stored = { ...stored, ...result.updates };
        }
        return { outcome: result.outcome, registration: stored };
      }
    );
  });

  it('a full refund marks the registration refunded', async () => {
    const result = await handleRefundEvent(completed('rf-1', 6360));

    expect(mocks.findBySquarePaymentId).toHaveBeenCalledWith('pay-1');
    expect(mocks.applySquareRefund).toHaveBeenCalledWith('reg-1', {
      refundId: 'rf-1',
      amountCents: 6360,
      at: new Date('2026-10-15T15:00:00Z'),
    });
    expect(result.action).toBe('refunded');
    expect(stored).toMatchObject({
      status: 'refunded',
      refundedAmountCents: 6360,
      squareRefundId: 'rf-1',
      squareRefundIds: ['rf-1'],
      refundedAt: new Date('2026-10-15T15:00:00Z'),
    });
  });

  it('a partial refund records the amount and keeps the student enrolled', async () => {
    const result = await handleRefundEvent(completed('rf-1', 2000));

    expect(result.action).toBe('partially-refunded');
    expect(result.details).toContain('2000 of 6360');
    expect(stored.status).toBe('confirmed');
    expect(stored.refundedAmountCents).toBe(2000);
    expect(stored.refundedAt).toBeUndefined();
  });

  it('two partial refunds that add up to the price make it refunded', async () => {
    await handleRefundEvent(completed('rf-1', 2000));
    const second = await handleRefundEvent(completed('rf-2', 4360));

    expect(second.action).toBe('refunded');
    expect(stored).toMatchObject({
      status: 'refunded',
      refundedAmountCents: 6360,
      squareRefundIds: ['rf-1', 'rf-2'],
      squareRefundId: 'rf-2',
    });
  });

  it('a redelivered event is counted once', async () => {
    await handleRefundEvent(completed('rf-1', 2000));
    const replay = await handleRefundEvent(completed('rf-1', 2000));

    expect(replay.action).toBe('skipped');
    expect(replay.details).toContain('already counted');
    expect(stored.refundedAmountCents).toBe(2000);
  });

  it('is a no-op for the echo of a refund cancelRegistration already recorded', async () => {
    stored = confirmedRegistration({
      status: 'refunded',
      refundedAt: new Date('2026-10-14T00:00:00Z'),
      refundedAmountCents: 6360,
      squareRefundId: 'rf-app',
    });
    const before = { ...stored };

    const result = await handleRefundEvent(completed('rf-app', 6360));

    expect(result.action).toBe('skipped');
    expect(stored).toEqual(before);
  });

  it('skips a refund that matches no class registration', async () => {
    const result = await handleRefundEvent(
      completed('rf-1', 2000, { payment_id: 'pay-mt', order_id: 'ord-mt' })
    );

    expect(result.action).toBe('skipped');
    expect(result.details).toContain('no class registration');
    expect(mocks.applySquareRefund).not.toHaveBeenCalled();
  });

  it('falls back to the order id when no registration has the payment id', async () => {
    stored = confirmedRegistration({ squarePaymentId: undefined });
    const result = await handleRefundEvent(completed('rf-1', 6360));

    expect(mocks.findBySquarePaymentId).toHaveBeenCalledWith('pay-1');
    expect(mocks.findBySquareOrderId).toHaveBeenCalledWith('ord-1');
    expect(result.action).toBe('refunded');
  });

  it('matches by order id when the refund carries no payment id', async () => {
    const result = await handleRefundEvent(
      completed('rf-1', 6360, { payment_id: undefined })
    );
    expect(mocks.findBySquarePaymentId).not.toHaveBeenCalled();
    expect(result.action).toBe('refunded');
  });

  it.each(['PENDING', 'FAILED', 'REJECTED', undefined])(
    'skips a refund whose status is %s',
    async (status) => {
      const result = await handleRefundEvent(
        refundEvent(
          {
            id: 'rf-1',
            payment_id: 'pay-1',
            amount_money: { amount: 6360, currency: 'USD' },
            status,
          },
          'refund.created'
        )
      );
      expect(result.action).toBe('skipped');
      expect(mocks.findBySquarePaymentId).not.toHaveBeenCalled();
    }
  );

  it('skips a refund with no id or no amount', async () => {
    const noId = {
      merchant_id: 'ML1',
      type: 'refund.updated',
      event_id: 'evt-x',
      created_at: '2026-10-15T15:00:00Z',
      data: { type: 'refund', id: '', object: {} },
    } as unknown as Parameters<typeof handleRefundEvent>[0];
    expect((await handleRefundEvent(noId)).details).toBe('No refund id in payload');

    const noAmount = await handleRefundEvent(
      refundEvent({ id: 'rf-1', payment_id: 'pay-1', status: 'COMPLETED' })
    );
    expect(noAmount.details).toContain('no amount');
    expect(mocks.applySquareRefund).not.toHaveBeenCalled();
  });

  it('uses now when updated_at is missing or unreadable', async () => {
    const before = Date.now();
    await handleRefundEvent(completed('rf-1', 2000, { updated_at: 'not-a-date' }));
    const at: Date = mocks.applySquareRefund.mock.calls[0][1].at;
    expect(at.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('skips when the registration disappears before the transaction', async () => {
    mocks.applySquareRefund.mockResolvedValue(undefined);
    const result = await handleRefundEvent(completed('rf-1', 2000));
    expect(result).toMatchObject({ action: 'skipped' });
    expect(result.details).toContain('vanished');
  });

  it('is dispatched from the endpoint for refund.created and refund.updated', async () => {
    const { createHmac } = await import('crypto');
    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (req: unknown, res: unknown) => Promise<void>;

    for (const type of ['refund.created', 'refund.updated'] as const) {
      stored = confirmedRegistration();
      const body = {
        ...refundEvent(
          {
            id: `rf-${type}`,
            payment_id: 'pay-1',
            amount_money: { amount: 6360, currency: 'USD' },
            status: 'COMPLETED',
          },
          type
        ),
      } as unknown as Record<string, unknown>;
      const signature = createHmac('sha256', 'mock-secret')
        .update('https://mock-url.com/squareWebhook' + JSON.stringify(body))
        .digest('base64');
      const res = {
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
      };

      await fn(
        { method: 'POST', body, headers: { 'x-square-hmacsha256-signature': signature } },
        res
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'refunded' })
      );
    }
  });

  it('returns 500 so Square retries when the write fails', async () => {
    const { createHmac } = await import('crypto');
    const { squareWebhook } = await import('./square-webhook');
    const fn = squareWebhook as unknown as (req: unknown, res: unknown) => Promise<void>;
    mocks.applySquareRefund.mockRejectedValue(new Error('contention'));
    const body = completed('rf-1', 2000) as unknown as Record<string, unknown>;
    const signature = createHmac('sha256', 'mock-secret')
      .update('https://mock-url.com/squareWebhook' + JSON.stringify(body))
      .digest('base64');
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    await fn({ method: 'POST', body, headers: { 'x-square-hmacsha256-signature': signature } }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

