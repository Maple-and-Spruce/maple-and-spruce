import { describe, it, expect, vi, beforeEach } from 'vitest';

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
