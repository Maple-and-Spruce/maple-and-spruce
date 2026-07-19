/**
 * Square Checkout API service — hosted Payment Links.
 *
 * Creates a Square-hosted checkout page (a `square.link` / `checkout.square.site`
 * URL) that the buyer is redirected to and pays on. Because payment happens on
 * Square's own top-level page — not in a cross-origin iframe embedded in our
 * page — it is immune to Safari's Intelligent Tracking Prevention (ITP)
 * blocking the embedded Web Payments SDK's storage handshake
 * (`InitializationTimeoutError`). This is the reliable fallback for buyers whose
 * browser privacy settings break the inline card form.
 *
 * The order is built identically to `OrdersService.createOrder` (same line
 * items, tax, discounts, `referenceId`) so the hosted total matches the inline
 * card total to the cent. Payment completion flows back via the
 * `payment.updated` webhook (handled in square-webhook), which resolves the
 * order's `referenceId` to our pending Registration and flips it to confirmed.
 *
 * @see https://developer.squareup.com/docs/checkout-api
 * @see https://developer.squareup.com/reference/square/checkout-api/create-payment-link
 */
import { SquareClient, Square } from 'square';
import type {
  OrderLineItemInput,
  OrderTaxInput,
  OrderDiscountInput,
} from './orders.service';

export interface CreatePaymentLinkInput {
  /** Square location id. */
  locationId: string;
  /** Idempotency key (typically the Firestore registration id). */
  idempotencyKey: string;
  /**
   * External reference set on the order — the Firestore registration id. The
   * webhook reads this back off the paid order to reconcile the registration.
   */
  referenceId: string;
  /** Line items (class name × quantity). Same shape as OrdersService. */
  lineItems: OrderLineItemInput[];
  /** Taxes to apply (e.g. WV Sales Tax). */
  taxes: OrderTaxInput[];
  /** Discounts to apply. */
  discounts?: OrderDiscountInput[];
  /** Pre-fills the buyer's email on the hosted page. */
  buyerEmail?: string;
  /** Where Square sends the buyer's browser after a successful payment. */
  redirectUrl?: string;
  /** Short description shown on the hosted checkout page. */
  description?: string;
}

export interface CreatePaymentLinkResult {
  /** Square payment-link id. */
  paymentLinkId: string;
  /** Square order id created for the link (carries our `referenceId`). */
  orderId: string;
  /** Hosted checkout URL to redirect the buyer to. */
  url: string;
}

export class CheckoutService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Create a hosted checkout Payment Link for a class registration. The order
   * mirrors the inline card order exactly (line items + percentage tax +
   * discounts + `referenceId`) so the buyer sees the same total.
   */
  async createPaymentLink(
    input: CreatePaymentLinkInput
  ): Promise<CreatePaymentLinkResult> {
    const response = await this.client.checkout.paymentLinks.create({
      idempotencyKey: input.idempotencyKey,
      description: input.description,
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
      checkoutOptions: input.redirectUrl
        ? { redirectUrl: input.redirectUrl, askForShippingAddress: false }
        : { askForShippingAddress: false },
      prePopulatedData: input.buyerEmail
        ? { buyerEmail: input.buyerEmail }
        : undefined,
    });

    throwIfErrors(response.errors, 'create payment link');

    const link = response.paymentLink;
    if (!link?.id || !link.url || !link.orderId) {
      throw new Error(
        'Square create payment link returned no id/url/orderId'
      );
    }

    return {
      paymentLinkId: link.id,
      orderId: link.orderId,
      url: link.url,
    };
  }
}

function throwIfErrors(
  errors: Square.Error_[] | undefined,
  operation: string
): void {
  if (!errors || errors.length === 0) return;
  const msg = errors
    .map((e) => e.detail || e.code || 'Unknown error')
    .join('; ');
  throw new Error(`Square ${operation} error: ${msg}`);
}
