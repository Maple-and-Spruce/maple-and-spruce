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
import { SquareClient, Square, SquareError } from 'square';

const DECLINED = 'Your card was declined. Please try a different card.';
const CALL_BANK =
  'Your bank needs to approve this payment. Please call the number on the back of your card and try again, or use a different card.';
const CHECK_ZIP =
  "The ZIP code doesn't match the one your bank has for this card. Please check the ZIP code and try again.";
const CHECK_EXPIRATION =
  'The card expiration date is invalid. Please check your card details.';
const CHECK_CARD_NUMBER =
  'The card number is invalid. Please check your card details.';
const TRY_AGAIN_SOON =
  'Our payment processor had a brief problem. Please try again in a minute.';

/** Shown for any Square code not listed below. Never Square's own wording. */
export const GENERIC_PAYMENT_ERROR_MESSAGE =
  "We couldn't process this payment. Please try again or use a different card.";

/**
 * User-friendly messages for Square payment error codes.
 *
 * A code that is not here gets `GENERIC_PAYMENT_ERROR_MESSAGE`, never Square's
 * `detail`: that text is written for developers ("Authorization error:
 * 'TRANSACTION_LIMIT'", "Card nonce not found") and was shown to a family at
 * checkout. Square's code and detail stay on the `PaymentError` for logs.
 *
 * @see https://developer.squareup.com/docs/payments-api/error-codes
 */
const SQUARE_PAYMENT_ERROR_MESSAGES: Record<string, string> = {
  CARD_DECLINED: DECLINED,
  GENERIC_DECLINE: DECLINED,
  CARD_DECLINED_CALL_ISSUER: CALL_BANK,
  CARD_DECLINED_VERIFICATION_REQUIRED: CALL_BANK,
  VOICE_FAILURE: CALL_BANK,
  TRANSACTION_LIMIT:
    'This payment is over a limit on your card. Please try a different card, or call your bank and try again.',
  CVV_FAILURE:
    'The CVV number is incorrect. Please check your card details and try again.',
  // The card form only asks for a ZIP code, so say ZIP, not "address".
  ADDRESS_VERIFICATION_FAILURE: CHECK_ZIP,
  INVALID_POSTAL_CODE: CHECK_ZIP,
  INVALID_EXPIRATION: CHECK_EXPIRATION,
  BAD_EXPIRATION: CHECK_EXPIRATION,
  EXPIRATION_FAILURE: CHECK_EXPIRATION,
  INSUFFICIENT_FUNDS:
    'Insufficient funds. Please try a different payment method.',
  CARD_EXPIRED: 'Your card has expired. Please use a different card.',
  INVALID_CARD: CHECK_CARD_NUMBER,
  PAN_FAILURE: CHECK_CARD_NUMBER,
  INVALID_CARD_DATA: CHECK_CARD_NUMBER,
  CARD_NOT_SUPPORTED:
    'This card type is not supported. Please try a different card.',
  INVALID_ACCOUNT:
    'There is a problem with your card account. Please contact your bank.',
  CARD_TOKEN_EXPIRED:
    'Your payment session has expired. Please refresh the page and try again.',
  CARD_TOKEN_USED:
    'A payment error occurred. Please refresh the page and try again.',
  TEMPORARY_ERROR: TRY_AGAIN_SOON,
  INTERNAL_SERVER_ERROR: TRY_AGAIN_SOON,
  SERVICE_UNAVAILABLE: TRY_AGAIN_SOON,
  GATEWAY_TIMEOUT: TRY_AGAIN_SOON,
  RATE_LIMITED: TRY_AGAIN_SOON,
};

/**
 * Minimal shape of a Square error object (works with both Square.Error_
 * and SquareError.BodyError).
 */
interface SquareErrorEntry {
  code?: string;
  detail?: string;
}

/**
 * The customer-facing message for a Square API error: the wording for the
 * first code we know, or the generic line. Square's `detail` is never
 * returned.
 */
export function getPaymentErrorMessage(errors: SquareErrorEntry[]): string {
  for (const error of errors) {
    const code = error.code || '';
    if (code in SQUARE_PAYMENT_ERROR_MESSAGES) {
      return SQUARE_PAYMENT_ERROR_MESSAGES[code];
    }
  }
  return GENERIC_PAYMENT_ERROR_MESSAGE;
}

/** Whether we have our own wording for any of these Square errors. */
function hasKnownPaymentErrorCode(errors: SquareErrorEntry[]): boolean {
  return errors.some((e) => (e.code || '') in SQUARE_PAYMENT_ERROR_MESSAGES);
}

/**
 * Turn anything `payments.create` threw, or the errors it returned, into a
 * `PaymentError` with customer-safe wording. An unrecognised failure is logged
 * with Square's own code and detail, since the customer no longer sees them.
 */
function toPaymentError(
  error: unknown,
  responseErrors?: SquareErrorEntry[]
): PaymentError {
  const squareErrors =
    responseErrors ?? (error instanceof SquareError ? error.errors ?? [] : []);
  const code = squareErrors[0]?.code;
  const detail =
    squareErrors[0]?.detail ??
    (error instanceof Error ? error.message : undefined);
  if (!hasKnownPaymentErrorCode(squareErrors)) {
    console.error(
      JSON.stringify({
        event: 'payment_error_unmapped',
        squareErrorCode: code ?? null,
        detail: detail ?? null,
      })
    );
  }
  return new PaymentError(getPaymentErrorMessage(squareErrors), code, detail);
}

/**
 * Custom error class for payment failures that preserves user-friendly messages.
 */
export class PaymentError extends Error {
  constructor(
    public readonly userMessage: string,
    public readonly squareErrorCode?: string,
    /** Square's own description, for logs and staff. Never shown to a customer. */
    public readonly squareDetail?: string
  ) {
    super(userMessage);
    this.name = 'PaymentError';
  }
}

/**
 * Square codes that mean Square itself failed, so the payment may or may not
 * have been taken.
 */
const OUTCOME_UNKNOWN_CODES = new Set([
  'INTERNAL_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
  'GATEWAY_TIMEOUT',
]);

/**
 * Whether a failed `createPayment` leaves it unknown if Square took the
 * payment: a timeout or network failure (no Square code at all), or a Square
 * server error. A decline or a bad card always carries its own code, and
 * nothing was taken. Sending the same request again with the same idempotency
 * key is safe: Square returns the first result if there was one.
 */
export function isPaymentOutcomeUnknown(error: unknown): boolean {
  if (!(error instanceof PaymentError)) return true;
  if (!error.squareErrorCode) return true;
  return OUTCOME_UNKNOWN_CODES.has(error.squareErrorCode);
}

/**
 * Input for creating a payment
 */
export interface CreatePaymentInput {
  /**
   * Payment source ID. Either a single-use nonce from the Web Payments SDK
   * `card.tokenize()`, OR a stored card-on-file ID (in which case `customerId`
   * must also be set — Square requires it to charge a saved card).
   */
  sourceId: string;
  /** Amount to charge in cents (e.g., 2500 = $25.00) */
  amountCents: number;
  /** Idempotency key to prevent duplicate charges */
  idempotencyKey: string;
  /** Square location ID */
  locationId: string;
  /**
   * Square customer ID. Required when `sourceId` is a stored card-on-file ID;
   * optional for one-time nonce payments.
   */
  customerId?: string;
  /** Customer email for receipt */
  buyerEmailAddress?: string;
  /** Description/note for the payment */
  note?: string;
  /** External reference ID (e.g., registration ID) */
  referenceId?: string;
  /** Square order ID to associate with this payment */
  orderId?: string;
  /**
   * Complete the payment at once (the default). Pass false to only authorize
   * it, for a split payment that `OrdersService.payOrder` completes together.
   */
  autocomplete?: boolean;
  /**
   * Let Square approve less than asked when the source cannot cover it. A gift
   * card payment needs this (and `autocomplete: false`); read the approved
   * amount back from `amountCents`.
   */
  acceptPartialAuthorization?: boolean;
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
  /**
   * What Square approved, in cents (`amount_money`). Lower than asked when a
   * partial authorization was accepted (a gift card with less on it).
   */
  amountCents: number;
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
  /** Square order id this payment paid for, if any (POS + web both set it). */
  orderId?: string;
  /** Square customer id attached to the payment, if any. */
  customerId?: string;
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
    let response;
    try {
      response = await this.client.payments.create({
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        amountMoney: {
          amount: BigInt(input.amountCents),
          currency: 'USD',
        },
        locationId: input.locationId,
        customerId: input.customerId,
        autocomplete: input.autocomplete ?? true,
        ...(input.acceptPartialAuthorization !== undefined && {
          acceptPartialAuthorization: input.acceptPartialAuthorization,
        }),
        buyerEmailAddress: input.buyerEmailAddress,
        note: input.note,
        referenceId: input.referenceId,
        orderId: input.orderId,
      });
    } catch (error) {
      // Square SDK throws SquareError for HTTP-level failures (4xx/5xx)
      throw toPaymentError(error);
    }

    if (response.errors && response.errors.length > 0) {
      throw toPaymentError(undefined, response.errors);
    }

    const payment = response.payment;
    if (!payment) {
      throw new PaymentError(GENERIC_PAYMENT_ERROR_MESSAGE);
    }

    return {
      paymentId: payment.id!,
      status: payment.status || 'UNKNOWN',
      receiptUrl: payment.receiptUrl ?? undefined,
      totalCents: Number(payment.totalMoney?.amount ?? 0),
      amountCents: Number(
        payment.amountMoney?.amount ?? payment.totalMoney?.amount ?? 0
      ),
    };
  }

  /**
   * Void a payment that was only authorized (`autocomplete: false`), so no
   * money moves. A gift card's held amount goes back onto the card.
   *
   * @see https://developer.squareup.com/reference/square/payments-api/cancel-payment
   */
  async cancelPayment(paymentId: string): Promise<void> {
    const response = await this.client.payments.cancel({ paymentId });
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e: Square.Error_) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square cancel payment error: ${errorMessages}`);
    }
  }

  /**
   * Void a payment by the idempotency key that created it. For when the
   * create call failed in a way that leaves it unknown whether Square took
   * the payment (a timeout): Square cancels it if it exists.
   */
  async cancelPaymentByIdempotencyKey(idempotencyKey: string): Promise<void> {
    const response = await this.client.payments.cancelByIdempotencyKey({
      idempotencyKey,
    });
    if (response.errors && response.errors.length > 0) {
      const errorMessages = response.errors
        .map((e: Square.Error_) => e.detail || e.code || 'Unknown error')
        .join(', ');
      throw new Error(`Square cancel payment error: ${errorMessages}`);
    }
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
      orderId: payment.orderId ?? undefined,
      customerId: payment.customerId ?? undefined,
    };
  }
}
