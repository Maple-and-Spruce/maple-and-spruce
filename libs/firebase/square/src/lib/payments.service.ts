/**
 * Square Payments API service
 *
 * Handles payment processing and refunds for class registrations.
 * Uses Square's Payments API with nonce-based card tokens from the
 * Web Payments SDK on the frontend.
 *
 * @see https://developer.squareup.com/docs/payments-api/overview
 * @see https://developer.squareup.com/docs/web-payments/overview
 */
import { SquareClient, Square } from 'square';

/**
 * Input for creating a payment
 */
export interface CreatePaymentInput {
  /** Payment source ID (nonce from Web Payments SDK card.tokenize()) */
  sourceId: string;
  /** Amount to charge in cents (e.g., 2500 = $25.00) */
  amountCents: number;
  /** Idempotency key to prevent duplicate charges */
  idempotencyKey: string;
  /** Square location ID */
  locationId: string;
  /** Customer email for receipt */
  buyerEmailAddress?: string;
  /** Description/note for the payment */
  note?: string;
  /** External reference ID (e.g., registration ID) */
  referenceId?: string;
}

/**
 * Result of creating a payment
 */
export interface CreatePaymentResult {
  /** Square payment ID */
  paymentId: string;
  /** Payment status: COMPLETED, APPROVED, PENDING, FAILED, CANCELED */
  status: string;
  /** Receipt URL (available for COMPLETED payments) */
  receiptUrl?: string;
  /** Total amount charged in cents */
  totalCents: number;
}

/**
 * Input for refunding a payment
 */
export interface RefundPaymentInput {
  /** Square payment ID to refund */
  paymentId: string;
  /** Amount to refund in cents */
  amountCents: number;
  /** Idempotency key to prevent duplicate refunds */
  idempotencyKey: string;
  /** Reason for the refund */
  reason?: string;
}

/**
 * Result of refunding a payment
 */
export interface RefundPaymentResult {
  /** Square refund ID */
  refundId: string;
  /** Refund status: PENDING, COMPLETED, REJECTED, FAILED */
  status: string;
  /** Amount refunded in cents */
  amountCents: number;
}

/**
 * Result of getting a payment
 */
export interface GetPaymentResult {
  /** Square payment ID */
  paymentId: string;
  /** Payment status */
  status: string;
  /** Amount charged in cents */
  amountCents: number;
  /** Amount refunded in cents */
  refundedCents: number;
  /** Receipt URL */
  receiptUrl?: string;
  /** Payment creation timestamp */
  createdAt: string;
}

/**
 * Payments service for Square API operations
 */
export class PaymentsService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Create a payment (charge a card)
   *
   * The sourceId comes from the frontend's Square Web Payments SDK:
   * 1. Frontend loads Square Web Payments SDK
   * 2. Customer enters card details in Square's hosted fields
   * 3. Frontend calls card.tokenize() to get a nonce
   * 4. Nonce is sent to this function as sourceId
   *
   * @see https://developer.squareup.com/docs/web-payments/take-card-payment
   */
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const response = await this.client.payments.create({
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      amountMoney: {
        amount: BigInt(input.amountCents),
        currency: 'USD',
      },
      locationId: input.locationId,
      autocomplete: true,
      buyerEmailAddress: input.buyerEmailAddress,
      note: input.note,
      referenceId: input.referenceId,
    });

    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e: Square.Error_) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square payment error: ${errorMessages}`);
    }

    const payment = response.payment;
    if (!payment) {
      throw new Error('Square payment failed: no payment in response');
    }

    return {
      paymentId: payment.id!,
      status: payment.status || 'UNKNOWN',
      receiptUrl: payment.receiptUrl ?? undefined,
      totalCents: Number(payment.totalMoney?.amount ?? 0),
    };
  }

  /**
   * Refund a payment (full or partial)
   *
   * @see https://developer.squareup.com/docs/refunds-api/overview
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const response = await this.client.refunds.refundPayment({
      paymentId: input.paymentId,
      idempotencyKey: input.idempotencyKey,
      amountMoney: {
        amount: BigInt(input.amountCents),
        currency: 'USD',
      },
      reason: input.reason,
    });

    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e: Square.Error_) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square refund error: ${errorMessages}`);
    }

    const refund = response.refund;
    if (!refund) {
      throw new Error('Square refund failed: no refund in response');
    }

    return {
      refundId: refund.id!,
      status: refund.status || 'UNKNOWN',
      amountCents: Number(refund.amountMoney?.amount ?? 0),
    };
  }

  /**
   * Get a payment by ID
   */
  async getPayment(paymentId: string): Promise<GetPaymentResult> {
    const response = await this.client.payments.get({ paymentId });

    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e: Square.Error_) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square get payment error: ${errorMessages}`);
    }

    const payment = response.payment;
    if (!payment) {
      throw new Error(`Square payment not found: ${paymentId}`);
    }

    return {
      paymentId: payment.id!,
      status: payment.status || 'UNKNOWN',
      amountCents: Number(payment.totalMoney?.amount ?? 0),
      refundedCents: Number(payment.refundedMoney?.amount ?? 0),
      receiptUrl: payment.receiptUrl ?? undefined,
      createdAt: payment.createdAt || new Date().toISOString(),
    };
  }
}
