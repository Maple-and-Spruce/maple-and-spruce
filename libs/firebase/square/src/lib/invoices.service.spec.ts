import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvoicesService } from './invoices.service';
import type { SquareClient } from 'square';

/**
 * Unit tests for the Square InvoicesService wrapper. Mocks the Square
 * client at the method level and verifies our orchestration:
 *   upsertCustomer → createInvoiceOrder → createDraftInvoice → publishInvoice
 * plus cancelInvoice + error paths.
 */

interface MockClient {
  customers: {
    search: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  orders: {
    create: ReturnType<typeof vi.fn>;
  };
  invoices: {
    create: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
}

function makeMockClient(): MockClient {
  return {
    customers: {
      search: vi.fn(),
      create: vi.fn(),
    },
    orders: {
      create: vi.fn(),
    },
    invoices: {
      create: vi.fn(),
      publish: vi.fn(),
      get: vi.fn(),
      cancel: vi.fn(),
    },
  };
}

const sampleInput = () => ({
  locationId: 'LW0MMBZ',
  idempotencyKey: 'firebase-inv-123',
  customer: {
    email: 'parent@example.com',
    name: 'Rita Thompson',
  },
  lineItems: [
    {
      name: 'April tuition',
      quantity: '4',
      unitAmountCents: 3250,
    },
  ],
  title: 'Music lessons — Olive',
  description: 'Mailed 4/20',
});

describe('InvoicesService.sendInvoice', () => {
  let client: MockClient;
  let service: InvoicesService;

  beforeEach(() => {
    client = makeMockClient();
    service = new InvoicesService(client as unknown as SquareClient);

    client.orders.create.mockResolvedValue({
      errors: [],
      order: { id: 'SQ-ORDER-1', totalMoney: { amount: 13000n } },
    });
    client.invoices.create.mockResolvedValue({
      errors: [],
      invoice: { id: 'SQ-INVOICE-1', version: 0 },
    });
    client.invoices.publish.mockResolvedValue({
      errors: [],
      invoice: {
        id: 'SQ-INVOICE-1',
        publicUrl: 'https://squareup.com/pay/abc',
      },
    });
  });

  it('reuses an existing Square customer when one is found by email', async () => {
    client.customers.search.mockResolvedValue({
      customers: [{ id: 'SQ-CUST-EXISTING' }],
    });

    const result = await service.sendInvoice(sampleInput());

    expect(client.customers.search).toHaveBeenCalledWith({
      query: { filter: { emailAddress: { exact: 'parent@example.com' } } },
    });
    expect(client.customers.create).not.toHaveBeenCalled();
    expect(result.squareCustomerId).toBe('SQ-CUST-EXISTING');
  });

  it('creates a Square customer when none exists for the email', async () => {
    client.customers.search.mockResolvedValue({ customers: [] });
    client.customers.create.mockResolvedValue({
      errors: [],
      customer: { id: 'SQ-CUST-NEW' },
    });

    const result = await service.sendInvoice(sampleInput());

    expect(client.customers.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'customer-parent@example.com',
        givenName: 'Rita',
        familyName: 'Thompson',
        emailAddress: 'parent@example.com',
      })
    );
    expect(result.squareCustomerId).toBe('SQ-CUST-NEW');
  });

  it('splits a one-word name into givenName only', async () => {
    client.customers.search.mockResolvedValue({ customers: [] });
    client.customers.create.mockResolvedValue({
      errors: [],
      customer: { id: 'SQ-CUST-NEW' },
    });

    await service.sendInvoice({
      ...sampleInput(),
      customer: { email: 'x@y.com', name: 'Cher' },
    });

    const createArg = client.customers.create.mock.calls[0][0];
    expect(createArg.givenName).toBe('Cher');
    expect(createArg.familyName).toBeUndefined();
  });

  it('creates a Square order with the line items', async () => {
    client.customers.search.mockResolvedValue({
      customers: [{ id: 'SQ-CUST' }],
    });

    await service.sendInvoice(sampleInput());

    const orderArg = client.orders.create.mock.calls[0][0];
    expect(orderArg.idempotencyKey).toBe('firebase-inv-123-order');
    expect(orderArg.order.locationId).toBe('LW0MMBZ');
    expect(orderArg.order.lineItems).toHaveLength(1);
    expect(orderArg.order.lineItems[0]).toEqual({
      name: 'April tuition',
      quantity: '4',
      basePriceMoney: { amount: 3250n, currency: 'USD' },
    });
  });

  it('creates a draft invoice pointing at the order + customer, card-only', async () => {
    client.customers.search.mockResolvedValue({
      customers: [{ id: 'SQ-CUST' }],
    });

    await service.sendInvoice(sampleInput());

    const invoiceArg = client.invoices.create.mock.calls[0][0];
    expect(invoiceArg.idempotencyKey).toBe('firebase-inv-123-invoice');
    expect(invoiceArg.invoice.orderId).toBe('SQ-ORDER-1');
    expect(invoiceArg.invoice.primaryRecipient).toEqual({
      customerId: 'SQ-CUST',
    });
    expect(invoiceArg.invoice.deliveryMethod).toBe('EMAIL');
    expect(invoiceArg.invoice.acceptedPaymentMethods).toEqual({
      card: true,
      squareGiftCard: false,
      bankAccount: false,
      buyNowPayLater: false,
      cashAppPay: false,
    });
    expect(invoiceArg.invoice.paymentRequests).toHaveLength(1);
    expect(invoiceArg.invoice.paymentRequests[0].requestType).toBe('BALANCE');
  });

  it('publishes the draft invoice with the current version and returns the hosted URL', async () => {
    client.customers.search.mockResolvedValue({
      customers: [{ id: 'SQ-CUST' }],
    });
    client.invoices.create.mockResolvedValue({
      errors: [],
      invoice: { id: 'SQ-INVOICE-2', version: 3 },
    });

    const result = await service.sendInvoice(sampleInput());

    expect(client.invoices.publish).toHaveBeenCalledWith({
      invoiceId: 'SQ-INVOICE-2',
      version: 3,
      idempotencyKey: 'firebase-inv-123-publish',
    });
    expect(result.squareInvoiceId).toBe('SQ-INVOICE-2');
    expect(result.publicUrl).toBe('https://squareup.com/pay/abc');
  });

  it('throws if Square returns errors on customer create', async () => {
    client.customers.search.mockResolvedValue({ customers: [] });
    client.customers.create.mockResolvedValue({
      errors: [{ code: 'INVALID_EMAIL_ADDRESS', detail: 'bad email' }],
    });

    await expect(service.sendInvoice(sampleInput())).rejects.toThrow(
      /create customer/
    );
  });

  it('throws if Square returns errors on order create', async () => {
    client.customers.search.mockResolvedValue({
      customers: [{ id: 'SQ-CUST' }],
    });
    client.orders.create.mockResolvedValue({
      errors: [{ code: 'INVALID_REQUEST', detail: 'bad line items' }],
    });

    await expect(service.sendInvoice(sampleInput())).rejects.toThrow(
      /create order/
    );
  });

  it('throws if the order response is missing an id', async () => {
    client.customers.search.mockResolvedValue({
      customers: [{ id: 'SQ-CUST' }],
    });
    client.orders.create.mockResolvedValue({ errors: [], order: {} });

    await expect(service.sendInvoice(sampleInput())).rejects.toThrow(
      /no id/
    );
  });

  it('throws if the invoice response is missing id or version', async () => {
    client.customers.search.mockResolvedValue({
      customers: [{ id: 'SQ-CUST' }],
    });
    client.invoices.create.mockResolvedValue({
      errors: [],
      invoice: { id: undefined, version: 0 },
    });

    await expect(service.sendInvoice(sampleInput())).rejects.toThrow(
      /no id\/version/
    );
  });
});

describe('InvoicesService.cancelInvoice', () => {
  let client: MockClient;
  let service: InvoicesService;

  beforeEach(() => {
    client = makeMockClient();
    service = new InvoicesService(client as unknown as SquareClient);
  });

  it('fetches the current invoice version before cancelling', async () => {
    client.invoices.get.mockResolvedValue({
      invoice: { id: 'SQ-INVOICE-1', version: 7 },
    });
    client.invoices.cancel.mockResolvedValue({ errors: [] });

    await service.cancelInvoice('SQ-INVOICE-1');

    expect(client.invoices.get).toHaveBeenCalledWith({
      invoiceId: 'SQ-INVOICE-1',
    });
    expect(client.invoices.cancel).toHaveBeenCalledWith({
      invoiceId: 'SQ-INVOICE-1',
      version: 7,
    });
  });

  it('throws if Square returns no version (unknown invoice)', async () => {
    client.invoices.get.mockResolvedValue({ invoice: {} });

    await expect(service.cancelInvoice('missing')).rejects.toThrow(
      /no version/
    );
    expect(client.invoices.cancel).not.toHaveBeenCalled();
  });

  it('throws if Square returns errors on cancel', async () => {
    client.invoices.get.mockResolvedValue({
      invoice: { id: 'SQ-1', version: 1 },
    });
    client.invoices.cancel.mockResolvedValue({
      errors: [{ code: 'INVALID_INVOICE_STATUS', detail: 'already paid' }],
    });

    await expect(service.cancelInvoice('SQ-1')).rejects.toThrow(
      /cancel invoice/
    );
  });
});
