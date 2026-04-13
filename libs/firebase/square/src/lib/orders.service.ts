/**
 * Square Orders API service
 *
 * Creates orders with line items and tax for class registrations.
 * Orders are created before payment so that tax appears on Square receipts
 * and in Square Dashboard for quarterly sales tax reporting.
 *
 * @see https://developer.squareup.com/docs/orders-api/create-orders
 * @see https://developer.squareup.com/docs/orders-api/pay-for-orders
 */
import { SquareClient, Square } from 'square';

/**
 * Line item for a Square order
 */
export interface OrderLineItemInput {
  /** Item name (e.g., class name) */
  name: string;
  /** Quantity as string (Square requires string) */
  quantity: string;
  /** Base price per unit in cents */
  basePriceCents: number;
}

/**
 * Tax to apply to a Square order
 */
export interface OrderTaxInput {
  /** Tax name (e.g., "WV Sales Tax") */
  name: string;
  /** Tax rate as percentage string (e.g., "6.0") */
  percentage: string;
  /** Tax scope: ORDER applies to all line items */
  scope: 'ORDER' | 'LINE_ITEM';
}

/**
 * Discount to apply to a Square order
 */
export interface OrderDiscountInput {
  /** Discount name */
  name: string;
  /** Discount amount in cents */
  amountCents: number;
  /** Discount scope */
  scope: 'ORDER' | 'LINE_ITEM';
}

/**
 * Input for creating a Square order
 */
export interface CreateOrderInput {
  /** Square location ID */
  locationId: string;
  /** Idempotency key to prevent duplicate orders */
  idempotencyKey: string;
  /** Line items in the order */
  lineItems: OrderLineItemInput[];
  /** Taxes to apply */
  taxes: OrderTaxInput[];
  /** Discounts to apply */
  discounts?: OrderDiscountInput[];
  /** External reference ID (e.g., registration ID) */
  referenceId?: string;
}

/**
 * Result of creating a Square order
 */
export interface CreateOrderResult {
  /** Square order ID */
  orderId: string;
  /** Total amount in cents (including tax) */
  totalCents: number;
  /** Total tax amount in cents */
  taxCents: number;
}

/**
 * Orders service for Square API operations
 */
export class OrdersService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Create an order with line items, taxes, and optional discounts.
   *
   * The order is created in OPEN state. To complete it, pass the orderId
   * to PaymentsService.createPayment().
   */
  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const response = await this.client.orders.create({
      idempotencyKey: input.idempotencyKey,
      order: {
        locationId: input.locationId,
        referenceId: input.referenceId,
        lineItems: input.lineItems.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          basePriceMoney: {
            amount: BigInt(item.basePriceCents),
            currency: 'USD',
          },
        })),
        taxes: input.taxes.map((tax) => ({
          name: tax.name,
          percentage: tax.percentage,
          scope: tax.scope,
        })),
        discounts: input.discounts?.map((discount) => ({
          name: discount.name,
          amountMoney: {
            amount: BigInt(discount.amountCents),
            currency: 'USD',
          },
          scope: discount.scope,
        })),
      },
    });

    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e: Square.Error_) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square order error: ${errorMessages}`);
    }

    const order = response.order;
    if (!order || !order.id) {
      throw new Error('Square order failed: no order in response');
    }

    return {
      orderId: order.id,
      totalCents: Number(order.totalMoney?.amount ?? 0),
      taxCents: Number(order.totalTaxMoney?.amount ?? 0),
    };
  }
}
