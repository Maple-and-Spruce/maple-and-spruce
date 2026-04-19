/**
 * Square Invoices API service
 *
 * Sends private-pay music lesson invoices via Square:
 * 1. Ensures a Square Customer exists for the parent/adult student (email-keyed)
 * 2. Creates a Square Order with the invoice's line items
 * 3. Creates a Square Invoice referencing the order + customer
 * 4. Publishes the invoice — Square then emails the customer a hosted
 *    payment page and handles reminders / receipts automatically.
 *
 * Payment completion flows back via the `invoice.payment_made` webhook
 * event (handled in square-webhook) which updates our Firestore Invoice
 * record with paymentRecord { source: 'square-webhook', squarePaymentId }.
 *
 * @see https://developer.squareup.com/docs/invoices-api/overview
 */
import { SquareClient, Square } from 'square';

export interface InvoiceCustomerInput {
  /** Primary contact email — used as idempotency key for Square customer lookup. */
  email: string;
  /** Customer display name. */
  name: string;
  phone?: string;
}

export interface InvoiceLineItemInput {
  name: string;
  /** Stringified quantity, per Square's Orders API. */
  quantity: string;
  /** Base price per unit in cents. */
  unitAmountCents: number;
}

export interface SendInvoiceInput {
  /** Square location id. */
  locationId: string;
  /** Idempotency key (typically the Firestore invoice id). */
  idempotencyKey: string;
  customer: InvoiceCustomerInput;
  lineItems: InvoiceLineItemInput[];
  /** Short title shown on the hosted payment page. */
  title: string;
  /** Optional longer description / notes shown on the invoice. */
  description?: string;
}

export interface SendInvoiceResult {
  squareCustomerId: string;
  squareOrderId: string;
  squareInvoiceId: string;
  /** Hosted payment page URL Square returns on publish. */
  publicUrl?: string;
}

export class InvoicesService {
  constructor(private readonly client: SquareClient) {}

  /**
   * Full happy-path send: upsert customer, create order, create invoice,
   * publish it. Returns the Square ids for our Firestore record.
   */
  async sendInvoice(input: SendInvoiceInput): Promise<SendInvoiceResult> {
    const squareCustomerId = await this.upsertCustomer(input.customer);

    const orderId = await this.createInvoiceOrder(input);

    const { invoiceId, version } = await this.createDraftInvoice({
      orderId,
      customerId: squareCustomerId,
      idempotencyKey: `${input.idempotencyKey}-invoice`,
      title: input.title,
      description: input.description,
    });

    const publishResult = await this.publishInvoice({
      invoiceId,
      version,
      idempotencyKey: `${input.idempotencyKey}-publish`,
    });

    return {
      squareCustomerId,
      squareOrderId: orderId,
      squareInvoiceId: invoiceId,
      publicUrl: publishResult.publicUrl,
    };
  }

  /**
   * Cancel a published Square invoice. Used when our Invoice transitions
   * to `void` before the customer has paid.
   */
  async cancelInvoice(squareInvoiceId: string): Promise<void> {
    // Fetch current version first — Square requires optimistic concurrency.
    const current = await this.client.invoices.get({
      invoiceId: squareInvoiceId,
    });
    const version = current.invoice?.version;
    if (version === undefined) {
      throw new Error(
        `Square invoice ${squareInvoiceId} has no version; cannot cancel`
      );
    }

    const response = await this.client.invoices.cancel({
      invoiceId: squareInvoiceId,
      version,
    });

    throwIfErrors(response.errors, 'cancel invoice');
  }

  /**
   * Look up a Square Customer by email; create one if not found. Square
   * customers are not strictly deduplicated, so email-first lookup keeps
   * us from creating duplicates when Katie resends to the same parent.
   */
  private async upsertCustomer(
    customer: InvoiceCustomerInput
  ): Promise<string> {
    // Attempt to find an existing customer by email
    const searchResponse = await this.client.customers.search({
      query: {
        filter: {
          emailAddress: { exact: customer.email },
        },
      },
    });

    const existingId = searchResponse.customers?.[0]?.id;
    if (existingId) {
      return existingId;
    }

    // Not found — create a new customer
    const [givenName, ...familyNameParts] = customer.name.split(' ');
    const familyName = familyNameParts.join(' ') || undefined;

    const createResponse = await this.client.customers.create({
      idempotencyKey: `customer-${customer.email}`,
      givenName: givenName || customer.name,
      familyName,
      emailAddress: customer.email,
      phoneNumber: customer.phone,
    });

    throwIfErrors(createResponse.errors, 'create customer');

    const newId = createResponse.customer?.id;
    if (!newId) {
      throw new Error('Square customer create returned no id');
    }
    return newId;
  }

  /**
   * Create a Square Order for the invoice's line items. The order lives
   * in OPEN state until the invoice charges it; no tax applied here since
   * music lessons are a service (not subject to WV sales tax under
   * §11-15-3). The order's total equals the invoice's pre-payment total.
   */
  private async createInvoiceOrder(
    input: SendInvoiceInput
  ): Promise<string> {
    const response = await this.client.orders.create({
      idempotencyKey: `${input.idempotencyKey}-order`,
      order: {
        locationId: input.locationId,
        lineItems: input.lineItems.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          basePriceMoney: {
            amount: BigInt(line.unitAmountCents),
            currency: 'USD',
          },
        })),
      },
    });

    throwIfErrors(response.errors, 'create order');

    const orderId = response.order?.id;
    if (!orderId) {
      throw new Error('Square order create returned no id');
    }
    return orderId;
  }

  /**
   * Create an unpublished (draft) invoice. Payment request defaults to
   * the full balance, due on send, card-only accepted methods.
   */
  private async createDraftInvoice(args: {
    orderId: string;
    customerId: string;
    idempotencyKey: string;
    title: string;
    description?: string;
  }): Promise<{ invoiceId: string; version: number }> {
    const response = await this.client.invoices.create({
      idempotencyKey: args.idempotencyKey,
      invoice: {
        orderId: args.orderId,
        title: args.title,
        description: args.description,
        primaryRecipient: { customerId: args.customerId },
        paymentRequests: [
          {
            requestType: 'BALANCE',
            dueDate: new Date().toISOString().slice(0, 10),
            automaticPaymentSource: 'NONE',
          },
        ],
        deliveryMethod: 'EMAIL',
        acceptedPaymentMethods: {
          card: true,
          squareGiftCard: false,
          bankAccount: false,
          buyNowPayLater: false,
          cashAppPay: false,
        },
      },
    });

    throwIfErrors(response.errors, 'create invoice');

    const invoiceId = response.invoice?.id;
    const version = response.invoice?.version;
    if (!invoiceId || version === undefined) {
      throw new Error('Square invoice create returned no id/version');
    }
    return { invoiceId, version };
  }

  /**
   * Publish a draft invoice — this triggers Square to email the customer
   * the hosted payment page. Returns the page URL.
   */
  private async publishInvoice(args: {
    invoiceId: string;
    version: number;
    idempotencyKey: string;
  }): Promise<{ publicUrl?: string }> {
    const response = await this.client.invoices.publish({
      invoiceId: args.invoiceId,
      version: args.version,
      idempotencyKey: args.idempotencyKey,
    });

    throwIfErrors(response.errors, 'publish invoice');

    return { publicUrl: response.invoice?.publicUrl };
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
