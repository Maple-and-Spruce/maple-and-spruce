import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrdersService } from './orders.service';

function createMockClient() {
  return {
    orders: {
      create: vi.fn(),
      get: vi.fn(),
    },
  };
}

describe('OrdersService', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let service: OrdersService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new OrdersService(mockClient as any);
  });

  describe('getOrder', () => {
    it('fetches an order and maps its fields', async () => {
      mockClient.orders.get.mockResolvedValue({
        order: {
          id: 'order-1',
          referenceId: 'reg-abc',
          customerId: 'cust-1',
          totalMoney: { amount: BigInt(4770), currency: 'USD' },
          lineItems: [
            {
              catalogObjectId: 'VAR_A',
              name: 'Pottery 101',
              quantity: '2',
              basePriceMoney: { amount: BigInt(2250) },
              grossSalesMoney: { amount: BigInt(4500) },
              totalTaxMoney: { amount: BigInt(270) },
              totalMoney: { amount: BigInt(4770) },
            },
          ],
        },
      });

      const result = await service.getOrder('order-1');

      expect(mockClient.orders.get).toHaveBeenCalledWith({ orderId: 'order-1' });
      expect(result).toEqual({
        orderId: 'order-1',
        referenceId: 'reg-abc',
        customerId: 'cust-1',
        totalCents: 4770,
        lineItems: [
          {
            catalogObjectId: 'VAR_A',
            name: 'Pottery 101',
            quantity: 2,
            basePriceCents: 2250,
            grossSalesCents: 4500,
            totalTaxCents: 270,
            totalCents: 4770,
          },
        ],
      });
    });

    it('leaves referenceId/customerId undefined and quantity defaulting when absent', async () => {
      mockClient.orders.get.mockResolvedValue({
        order: {
          id: 'order-2',
          totalMoney: { amount: BigInt(0) },
          lineItems: [
            { catalogObjectId: 'VAR_B', name: 'Misc' },
          ],
        },
      });

      const result = await service.getOrder('order-2');

      expect(result.referenceId).toBeUndefined();
      expect(result.customerId).toBeUndefined();
      expect(result.lineItems[0].quantity).toBe(1);
      expect(result.lineItems[0].basePriceCents).toBeUndefined();
    });

    it('handles an order with no line items', async () => {
      mockClient.orders.get.mockResolvedValue({
        order: { id: 'order-3', totalMoney: { amount: BigInt(100) } },
      });

      const result = await service.getOrder('order-3');

      expect(result.lineItems).toEqual([]);
    });

    it('throws with Square error detail when the response has errors', async () => {
      mockClient.orders.get.mockResolvedValue({
        errors: [{ code: 'NOT_FOUND', detail: 'Order not found' }],
      });

      await expect(service.getOrder('order-missing')).rejects.toThrow(
        'Square get order error: Order not found'
      );
    });

    it('throws when the order is not in the response', async () => {
      mockClient.orders.get.mockResolvedValue({});

      await expect(service.getOrder('order-x')).rejects.toThrow(
        'Square order not found: order-x'
      );
    });
  });
});
