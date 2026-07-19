import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckoutService } from './checkout.service';
import type { SquareClient } from 'square';

/**
 * Unit tests for the Square CheckoutService (hosted Payment Links). Mocks the
 * SDK's checkout.paymentLinks.create and verifies we build the order to match
 * the inline-card order (line items + percentage tax + discounts + referenceId),
 * wire the redirect + buyer email, and surface ids / errors correctly.
 */

interface MockClient {
  checkout: {
    paymentLinks: {
      create: ReturnType<typeof vi.fn>;
    };
  };
}

function makeMockClient(): MockClient {
  return { checkout: { paymentLinks: { create: vi.fn() } } };
}

const sampleInput = () => ({
  locationId: 'LEJBNPRGM99NV',
  idempotencyKey: 'reg-abc123',
  referenceId: 'reg-abc123',
  lineItems: [{ name: 'Stained Glass — TryIt', quantity: '1', basePriceCents: 6000 }],
  taxes: [{ name: 'WV Sales Tax', percentage: '6.0', scope: 'ORDER' as const }],
  buyerEmail: 'buyer@example.com',
  redirectUrl: 'https://mapleandsprucefolkarts.com/registration-confirmed',
  description: 'Class registration — Stained Glass',
});

const okResponse = () => ({
  paymentLink: {
    id: 'plink_1',
    version: 1,
    orderId: 'order_1',
    url: 'https://square.link/u/plink_1',
    longUrl: 'https://checkout.square.site/merchant/x/checkout/plink_1',
  },
  errors: undefined,
});

describe('CheckoutService.createPaymentLink', () => {
  let mock: MockClient;
  let service: CheckoutService;

  beforeEach(() => {
    mock = makeMockClient();
    service = new CheckoutService(mock as unknown as SquareClient);
  });

  it('creates a payment link and returns its id, orderId, and hosted URL', async () => {
    mock.checkout.paymentLinks.create.mockResolvedValue(okResponse());

    const result = await service.createPaymentLink(sampleInput());

    expect(result).toEqual({
      paymentLinkId: 'plink_1',
      orderId: 'order_1',
      url: 'https://square.link/u/plink_1',
    });
  });

  it('builds the order with referenceId, line items, and percentage tax', async () => {
    mock.checkout.paymentLinks.create.mockResolvedValue(okResponse());

    await service.createPaymentLink(sampleInput());

    const arg = mock.checkout.paymentLinks.create.mock.calls[0][0];
    expect(arg.idempotencyKey).toBe('reg-abc123');
    expect(arg.order.locationId).toBe('LEJBNPRGM99NV');
    expect(arg.order.referenceId).toBe('reg-abc123');
    expect(arg.order.lineItems[0]).toMatchObject({
      name: 'Stained Glass — TryIt',
      quantity: '1',
      basePriceMoney: { amount: 6000n, currency: 'USD' },
    });
    expect(arg.order.taxes[0]).toMatchObject({
      name: 'WV Sales Tax',
      percentage: '6.0',
      scope: 'ORDER',
    });
  });

  it('sets the redirect URL and pre-fills the buyer email', async () => {
    mock.checkout.paymentLinks.create.mockResolvedValue(okResponse());

    await service.createPaymentLink(sampleInput());

    const arg = mock.checkout.paymentLinks.create.mock.calls[0][0];
    expect(arg.checkoutOptions.redirectUrl).toBe(
      'https://mapleandsprucefolkarts.com/registration-confirmed'
    );
    expect(arg.checkoutOptions.askForShippingAddress).toBe(false);
    expect(arg.prePopulatedData.buyerEmail).toBe('buyer@example.com');
  });

  it('maps discounts to amountMoney when present', async () => {
    mock.checkout.paymentLinks.create.mockResolvedValue(okResponse());

    await service.createPaymentLink({
      ...sampleInput(),
      discounts: [{ name: 'EARLYBIRD', amountCents: 1000, scope: 'ORDER' }],
    });

    const arg = mock.checkout.paymentLinks.create.mock.calls[0][0];
    expect(arg.order.discounts[0]).toMatchObject({
      name: 'EARLYBIRD',
      amountMoney: { amount: 1000n, currency: 'USD' },
      scope: 'ORDER',
    });
  });

  it('throws when Square returns errors', async () => {
    mock.checkout.paymentLinks.create.mockResolvedValue({
      errors: [{ code: 'BAD_REQUEST', detail: 'Invalid location' }],
    });

    await expect(service.createPaymentLink(sampleInput())).rejects.toThrow(
      /create payment link error: Invalid location/
    );
  });

  it('throws when the payment link is missing id/url/orderId', async () => {
    mock.checkout.paymentLinks.create.mockResolvedValue({
      paymentLink: { id: 'plink_1' },
    });

    await expect(service.createPaymentLink(sampleInput())).rejects.toThrow(
      /no id\/url\/orderId/
    );
  });
});
