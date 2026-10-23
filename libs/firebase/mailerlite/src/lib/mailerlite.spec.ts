import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  adjustOrderForRefund,
  isMailerLiteConfigured,
  tryAdjustOrderForRefund,
  buildOrderBody,
  buildProductBody,
  createOrUpdateOrder,
  MailerLiteError,
  tryRecordOrder,
  type MailerLiteConfig,
  type MailerLiteOrder,
  type MailerLiteProduct,
} from './mailerlite';

const config: MailerLiteConfig = {
  baseUrl: 'https://ml.test',
  apiKey: 'test-key',
  shopId: '42',
};

const product: MailerLiteProduct = {
  resourceId: 'class-1',
  name: 'Intro to Pottery',
  price: 47.7,
  url: 'https://example.com/classes/pottery',
};

const order: MailerLiteOrder = {
  resourceId: 'MS-ABC123',
  customerEmail: '  Robin@Example.COM ',
  items: [{ productResourceId: 'class-1', quantity: 2, price: 47.7 }],
  totalPrice: 95.4,
  status: 'complete',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const silent = { log: vi.fn(), error: vi.fn() };

describe('buildOrderBody', () => {
  it('never subscribes the buyer and leaves accepts_marketing untouched', () => {
    const body = buildOrderBody(order) as {
      customer: Record<string, unknown>;
    };
    expect(body.customer).toEqual({
      resource_id: 'robin@example.com',
      email: 'robin@example.com',
      create_subscriber: false,
    });
    expect(body.customer).not.toHaveProperty('accepts_marketing');
  });

  it('keys the order and cart on our id, with one cart line per item', () => {
    expect(buildOrderBody(order)).toMatchObject({
      resource_id: 'MS-ABC123',
      cart: {
        resource_id: 'MS-ABC123',
        items: [
          {
            resource_id: 'MS-ABC123-1',
            product_resource_id: 'class-1',
            quantity: 2,
            price: 47.7,
          },
        ],
      },
      status: 'complete',
      total_price: 95.4,
    });
  });
});

describe('buildProductBody', () => {
  it('excludes classes from product automations', () => {
    expect(buildProductBody(product)).toEqual({
      resource_id: 'class-1',
      name: 'Intro to Pottery',
      price: 47.7,
      url: 'https://example.com/classes/pottery',
      exclude_from_automations: true,
    });
  });

  it('omits url when there is none', () => {
    expect(buildProductBody({ ...product, url: undefined })).not.toHaveProperty(
      'url',
    );
  });
});

describe('requests', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('upserts the product, then creates the order, with resource ids and the key', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(201, { data: {} }))
      .mockResolvedValueOnce(jsonResponse(201, { data: {} }));

    await expect(
      tryRecordOrder(config, [product], order, silent),
    ).resolves.toBe(true);

    const [productCall, orderCall] = fetchMock.mock.calls;
    expect(productCall[0]).toBe(
      'https://ml.test/api/ecommerce/shops/42/products?with_resource_id',
    );
    expect(orderCall[0]).toBe(
      'https://ml.test/api/ecommerce/shops/42/orders?with_resource_id',
    );
    expect(orderCall[1].method).toBe('POST');
    expect(orderCall[1].headers.Authorization).toBe('Bearer test-key');
    expect(orderCall[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('updates the existing order when MailerLite says it already exists', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(422, {
          message:
            "An Ecommerce order with this resource ID already exists. Please include 'with_resource_id' in your request to update it.",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: {} }));

    await expect(createOrUpdateOrder(config, order)).resolves.toBe('updated');

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe(
      'https://ml.test/api/ecommerce/shops/42/orders/MS-ABC123?with_resource_id',
    );
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      status: 'complete',
      total_price: 95.4,
    });
  });

  it('rethrows any other 422 rather than overwriting', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(422, { message: 'The cart.items field is required.' }),
    );
    await expect(createOrUpdateOrder(config, order)).rejects.toBeInstanceOf(
      MailerLiteError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('swallows a failure and reports it without throwing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'down' }));
    const logger = { log: vi.fn(), error: vi.fn() };

    await expect(
      tryRecordOrder(config, [product], order, logger),
    ).resolves.toBe(false);
    // The product failed, so no order was attempted.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'MailerLite order send failed',
      expect.objectContaining({ orderResourceId: 'MS-ABC123' }),
    );
  });

  it('swallows a network error or timeout', async () => {
    fetchMock.mockRejectedValueOnce(
      new DOMException('timed out', 'TimeoutError'),
    );
    await expect(
      tryRecordOrder(config, [product], order, silent),
    ).resolves.toBe(false);
  });
});

describe('isMailerLiteConfigured', () => {
  it('is off for an empty or blank shop id', () => {
    expect(isMailerLiteConfigured({ ...config, shopId: '' })).toBe(false);
    expect(isMailerLiteConfigured({ ...config, shopId: '  ' })).toBe(false);
    expect(isMailerLiteConfigured(config)).toBe(true);
  });
});

describe('refund adjustments', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('lowers the total to what was kept after a partial refund', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: {} }));
    await expect(adjustOrderForRefund(config, 'MS-ABC123', 50)).resolves.toBe(
      'updated',
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://ml.test/api/ecommerce/shops/42/orders/MS-ABC123?with_resource_id',
    );
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({
      status: 'complete',
      total_price: 50,
    });
  });

  it('deletes the order when nothing was kept, with no request body', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(adjustOrderForRefund(config, 'MS-ABC123', 0)).resolves.toBe(
      'deleted',
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });

  it('treats a missing order as nothing to correct', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { message: 'Resource not found.' }),
    );
    await expect(adjustOrderForRefund(config, 'MS-NONE', 10)).resolves.toBe(
      'missing',
    );
  });

  it('swallows other failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'down' }));
    const logger = { log: vi.fn(), error: vi.fn() };
    await expect(
      tryAdjustOrderForRefund(config, 'MS-ABC123', 0, logger),
    ).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});
