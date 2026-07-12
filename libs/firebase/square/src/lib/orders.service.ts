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
 * A single line item read back from a Square order.
 */
export interface GetOrderLineItem {
  /** Catalog object (variation) id — maps to a class's `squareVariationId`. */
  catalogObjectId?: string;
  /** Line item name (e.g., class name) */
  name?: string;
  /** Quantity as a number (Square stores it as a string). */
  quantity: number;
  /** Base price per unit in cents, if present on the line item. */
  basePriceCents?: number;
}

/**
 * Result of fetching a Square order by ID. A slim projection of the fields
 * the POS class-registration worker needs — enough to dedup against web
 * orders (`referenceId`), resolve the buyer (`customerId`), and map each
 * line item back to a class variation.
 */
export interface GetOrderResult {
  /** Square order ID */
  orderId: string;
  /** External reference set when the order was created (web orders set this
   * to the Firestore registration id; POS orders leave it unset). */
  referenceId?: string;
  /** Square customer id attached to the order, if any. */
  customerId?: string;
  /** Order total in cents (including tax). */
  totalCents: number;
  /** Line items on the order. */
  lineItems: GetOrderLineItem[];
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

  /**
   * Fetch an order by ID.
   *
   * Used by the POS class-registration worker to read a completed in-person
   * sale: its `referenceId` (for web-order dedup), `customerId` (buyer), and
   * line items (mapped back to classes via `catalogObjectId`).
   */
  async getOrder(orderId: string): Promise<GetOrderResult> {
    const response = await this.client.orders.get({ orderId });

    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e: Square.Error_) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square get order error: ${errorMessages}`);
    }

    const order = response.order;
    if (!order || !order.id) {
      throw new Error(`Square order not found: ${orderId}`);
    }

    return {
      orderId: order.id,
      referenceId: order.referenceId ?? undefined,
      customerId: order.customerId ?? undefined,
      totalCents: Number(order.totalMoney?.amount ?? 0),
      lineItems: (order.lineItems ?? []).map((item) => ({
        catalogObjectId: item.catalogObjectId ?? undefined,
        name: item.name ?? undefined,
        // Square stores quantity as a string; coerce to a number.
        quantity: Number(item.quantity ?? '1'),
        basePriceCents: item.basePriceMoney?.amount
          ? Number(item.basePriceMoney.amount)
          : undefined,
      })),
    };
  }
}
