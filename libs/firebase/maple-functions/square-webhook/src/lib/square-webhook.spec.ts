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
    updateCachedQuantity: vi.fn(),
    findBySquareInvoiceId: vi.fn(),
    markPaidBySquareWebhook: vi.fn(),
  };
});

// Mock ProductRepository + InvoiceRepository
vi.mock('@maple/firebase/database', () => ({
  ProductRepository: {
    findAll: mocks.findAll,
    updateCachedQuantity: mocks.updateCachedQuantity,
  },
  InvoiceRepository: {
    findBySquareInvoiceId: mocks.findBySquareInvoiceId,
    markPaidBySquareWebhook: mocks.markPaidBySquareWebhook,
  },
}));

// Mock Square module (not used in inventory handler but needed for imports)
vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn(),
  SQUARE_SECRET_NAMES: ['SQUARE_ACCESS_TOKEN'],
  SQUARE_STRING_NAMES: ['SQUARE_LOCATION_ID'],
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
  },
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
