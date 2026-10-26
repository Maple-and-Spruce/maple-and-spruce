import { afterEach, describe, expect, it, vi } from 'vitest';
// The trigger reads the class name through the repository; keep these unit
// tests off Firestore entirely (ADR-017).
vi.mock('@maple/firebase/database', () => ({
  ClassRepository: { findById: vi.fn() },
}));

import {
  buildGa4PurchasePayload,
  buildMailerLiteSale,
  buildPurchaseEvent,
  emitGa4PurchaseIfConfirmed,
  emitMailerLiteOrderIfConfirmed,
  emitPurchaseIfConfirmed,
  sendGa4Payload,
  shouldEmitPurchase,
  splitName,
  type RegistrationConversionData,
} from './send-registration-conversion';

const silentLogger = { log: () => undefined, error: () => undefined };

const confirmed: RegistrationConversionData = {
  classId: 'cls_1',
  customerEmail: 'buyer@example.com',
  customerName: 'Jane Doe',
  customerPhone: '304-555-0100',
  quantity: 2,
  pricePaidCents: 10600,
  confirmationNumber: 'MS-ABC123',
  source: 'web',
  status: 'confirmed',
};

describe('shouldEmitPurchase', () => {
  it('fires on pending -> confirmed', () => {
    expect(
      shouldEmitPurchase({ ...confirmed, status: 'pending' }, confirmed),
    ).toBe(true);
  });

  it('fires on first write straight to confirmed (no before)', () => {
    expect(shouldEmitPurchase(undefined, confirmed)).toBe(true);
  });

  it('does NOT re-fire when already confirmed (later unrelated write)', () => {
    // A confirmed doc being written again (reminder timestamp, refund, etc.)
    // must not emit a second Purchase.
    expect(shouldEmitPurchase(confirmed, { ...confirmed })).toBe(false);
  });

  it('does not fire while still pending', () => {
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, status: 'pending' }),
    ).toBe(false);
  });

  it('does not fire on cancelled / refunded', () => {
    expect(
      shouldEmitPurchase(
        { ...confirmed, status: 'pending' },
        {
          ...confirmed,
          status: 'cancelled',
        },
      ),
    ).toBe(false);
  });

  it('skips in-person POS registrations (not ad-driven)', () => {
    expect(shouldEmitPurchase(undefined, { ...confirmed, source: 'pos' })).toBe(
      false,
    );
  });

  it('skips $0 registrations (free / fully discounted)', () => {
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, pricePaidCents: 0 }),
    ).toBe(false);
  });

  it('skips when classId or email is missing', () => {
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, classId: undefined }),
    ).toBe(false);
    expect(
      shouldEmitPurchase(undefined, { ...confirmed, customerEmail: undefined }),
    ).toBe(false);
  });

  it('handles a deleted doc (no after)', () => {
    expect(shouldEmitPurchase(confirmed, undefined)).toBe(false);
  });
});

describe('splitName', () => {
  it('splits first and last', () => {
    expect(splitName('Jane Doe')).toEqual({
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });
  it('keeps multi-word surnames', () => {
    expect(splitName('Mary Anne Van Der Berg')).toEqual({
      firstName: 'Mary',
      lastName: 'Anne Van Der Berg',
    });
  });
  it('single token -> first name only', () => {
    expect(splitName('Cher')).toEqual({ firstName: 'Cher' });
  });
  it('empty / undefined -> empty', () => {
    expect(splitName('   ')).toEqual({});
    expect(splitName(undefined)).toEqual({});
  });
});

describe('buildPurchaseEvent', () => {
  it('maps a confirmed registration to a dedup-keyed Purchase', () => {
    const event = buildPurchaseEvent(confirmed);

    expect(event).toMatchObject({
      eventName: 'Purchase',
      eventId: 'MS-ABC123', // dedup with the browser Pixel
      actionSource: 'website',
      user: {
        email: 'buyer@example.com',
        phone: '304-555-0100',
        firstName: 'Jane',
        lastName: 'Doe',
      },
      customData: {
        currency: 'USD',
        value: 106, // cents -> dollars
        content_ids: ['cls_1'], // catalog match id
        content_type: 'product',
        num_items: 2,
      },
    });
  });

  it('forwards fbp/fbc/event_source_url when present on the doc', () => {
    const event = buildPurchaseEvent({
      ...confirmed,
      fbp: 'fb.1.1.2',
      fbc: 'fb.1.1.click',
      eventSourceUrl: 'https://mapleandsprucefolkarts.com/classes/x',
    });
    expect(event.user.fbp).toBe('fb.1.1.2');
    expect(event.user.fbc).toBe('fb.1.1.click');
    expect(event.eventSourceUrl).toBe(
      'https://mapleandsprucefolkarts.com/classes/x',
    );
  });

  it('defaults num_items to 1 when quantity is absent', () => {
    const event = buildPurchaseEvent({ ...confirmed, quantity: undefined });
    expect(event.customData?.num_items).toBe(1);
  });
});

describe('emitPurchaseIfConfirmed', () => {
  it('sends the Purchase and reports success on a fresh confirmation', async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const sent = await emitPurchaseIfConfirmed(
      { ...confirmed, status: 'pending' },
      confirmed,
      send,
      silentLogger,
    );

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'Purchase', eventId: 'MS-ABC123' }),
    );
  });

  it('does not send when the write is not a fresh confirmation', async () => {
    const send = vi.fn();
    const sent = await emitPurchaseIfConfirmed(confirmed, confirmed, send);
    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows send failures (best-effort) and reports not-sent', async () => {
    const send = vi.fn().mockRejectedValue(new Error('CAPI 400'));
    const error = vi.fn();

    const sent = await emitPurchaseIfConfirmed(undefined, confirmed, send, {
      log: () => undefined,
      error,
    });

    expect(sent).toBe(false);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('buildGa4PurchasePayload', () => {
  it('maps a confirmed registration to a GA4 purchase in dollars', () => {
    const payload = buildGa4PurchasePayload({
      ...confirmed,
      gaClientId: '111.222',
      gaSessionId: '1700000000',
      eventSourceUrl: 'https://mapleandsprucefolkarts.com/classes/x',
    });

    expect(payload.client_id).toBe('111.222');
    expect(payload.events).toHaveLength(1);
    expect(payload.events[0].name).toBe('purchase');
    expect(payload.events[0].params).toEqual({
      transaction_id: 'MS-ABC123',
      currency: 'USD',
      value: 106,
      items: [{ item_id: 'cls_1', price: 53, quantity: 2 }],
      engagement_time_msec: 1,
      session_id: 1700000000, // a number, as GA4 expects
      page_location: 'https://mapleandsprucefolkarts.com/classes/x',
    });
  });

  it('falls back to a stable server client id and omits session_id', () => {
    const payload = buildGa4PurchasePayload(confirmed);
    expect(payload.client_id).toBe('server.MS-ABC123');
    expect(payload.events[0].params).not.toHaveProperty('session_id');
    expect(payload.events[0].params).not.toHaveProperty('page_location');
  });

  it('drops a non-numeric session id rather than sending NaN', () => {
    const payload = buildGa4PurchasePayload({
      ...confirmed,
      gaSessionId: 'not-a-number',
    });
    expect(payload.events[0].params).not.toHaveProperty('session_id');
  });

  it('treats a missing quantity as one item at the full price', () => {
    const payload = buildGa4PurchasePayload({
      ...confirmed,
      quantity: undefined,
    });
    expect(payload.events[0].params['items']).toEqual([
      { item_id: 'cls_1', price: 106, quantity: 1 },
    ]);
  });
});

describe('sendGa4Payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const config = {
    baseUrl: 'https://ga.example.com',
    measurementId: 'G-TEST',
    apiSecret: 'sec ret',
  };

  it('POSTs the payload to /mp/collect with the encoded credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = buildGa4PurchasePayload(confirmed);
    await sendGa4Payload(config, payload);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://ga.example.com/mp/collect?measurement_id=G-TEST&api_secret=sec%20ret',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(payload);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws on a non-2xx so the caller logs it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('bad', { status: 500 })),
    );
    await expect(
      sendGa4Payload(config, buildGa4PurchasePayload(confirmed)),
    ).rejects.toThrow('GA4 500: bad');
  });
});

describe('emitGa4PurchaseIfConfirmed', () => {
  it('sends the purchase on a fresh confirmation', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sent = await emitGa4PurchaseIfConfirmed(
      { ...confirmed, status: 'pending' },
      confirmed,
      send,
      silentLogger,
    );
    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ client_id: 'server.MS-ABC123' }),
    );
  });

  it('follows the same rule as Meta: no re-fire, no POS', async () => {
    const send = vi.fn();
    expect(
      await emitGa4PurchaseIfConfirmed(
        confirmed,
        confirmed,
        send,
        silentLogger,
      ),
    ).toBe(false);
    expect(
      await emitGa4PurchaseIfConfirmed(
        undefined,
        { ...confirmed, source: 'pos' },
        send,
        silentLogger,
      ),
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('swallows send failures and reports not-sent', async () => {
    const error = vi.fn();
    const sent = await emitGa4PurchaseIfConfirmed(
      undefined,
      confirmed,
      vi.fn().mockRejectedValue(new Error('GA4 500')),
      { log: () => undefined, error },
    );
    expect(sent).toBe(false);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('buildMailerLiteSale', () => {
  it('makes the class a product and the confirmation number the order id', () => {
    expect(
      buildMailerLiteSale(confirmed, {
        name: 'Intro to Pottery',
        webflowSlug: 'intro-to-pottery-a1b2c',
      }),
    ).toEqual({
      product: {
        resourceId: 'cls_1',
        name: 'Intro to Pottery',
        price: 53,
        url: 'https://mapleandsprucefolkarts.com/classes/intro-to-pottery-a1b2c',
      },
      order: {
        resourceId: 'MS-ABC123',
        customerEmail: 'buyer@example.com',
        // Dollars, not cents: 10600 cents for two seats.
        items: [{ productResourceId: 'cls_1', quantity: 2, price: 53 }],
        totalPrice: 106,
        status: 'complete',
      },
    });
  });

  it('names the product after the class id when the name is unknown', () => {
    const { product } = buildMailerLiteSale(confirmed, { name: '  ' });
    expect(product.name).toBe('cls_1');
    expect(product.url).toBeUndefined();
  });

  it("links the class's own page, not the page the buyer was on", () => {
    // A registration transferred to another run of the same class keeps the
    // eventSourceUrl of the run it was bought on.
    const { product } = buildMailerLiteSale(
      {
        ...confirmed,
        eventSourceUrl:
          'https://mapleandsprucefolkarts.com/classes/intro-to-pottery-0ld01',
      },
      { name: 'Intro to Pottery', webflowSlug: 'intro-to-pottery-n3w02' },
    );
    expect(product.url).toBe(
      'https://mapleandsprucefolkarts.com/classes/intro-to-pottery-n3w02',
    );
  });

  it('sends no URL rather than guess one when the class has no slug', () => {
    const { product } = buildMailerLiteSale(
      {
        ...confirmed,
        eventSourceUrl: 'https://mapleandsprucefolkarts.com/classes/other-run',
      },
      { name: 'Intro to Pottery' },
    );
    expect(product.url).toBeUndefined();
  });

  it('counts the seats paid for, with the unit price from the amount paid', () => {
    // Three seats, $60 each plus 6% tax: what the buyer paid at checkout.
    const { product, order } = buildMailerLiteSale({
      ...confirmed,
      quantity: 3,
      pricePaidCents: 19080,
    });
    expect(product.price).toBe(63.6);
    expect(order.items[0]).toEqual({
      productResourceId: 'cls_1',
      quantity: 3,
      price: 63.6,
    });
    expect(order.totalPrice).toBe(190.8);
  });

  it('treats a missing quantity as one seat', () => {
    const { order } = buildMailerLiteSale({
      ...confirmed,
      quantity: undefined,
    });
    expect(order.items[0]).toEqual({
      productResourceId: 'cls_1',
      quantity: 1,
      price: 106,
    });
  });
});

describe('emitMailerLiteOrderIfConfirmed', () => {
  const pending = { ...confirmed, status: 'pending' };
  const name = async () => ({
    name: 'Intro to Pottery',
    webflowSlug: 'intro-to-pottery-a1b2c',
  });

  it('records one order on a fresh confirmation', async () => {
    const record = vi.fn().mockResolvedValue(true);
    await expect(
      emitMailerLiteOrderIfConfirmed(
        pending,
        confirmed,
        true,
        name,
        record,
        silentLogger,
      ),
    ).resolves.toBe(true);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0][0].product.name).toBe('Intro to Pottery');
    expect(record.mock.calls[0][0].product.url).toBe(
      'https://mapleandsprucefolkarts.com/classes/intro-to-pottery-a1b2c',
    );
  });

  it('does nothing until a shop is configured', async () => {
    const record = vi.fn();
    await emitMailerLiteOrderIfConfirmed(
      pending,
      confirmed,
      false,
      name,
      record,
      silentLogger,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('follows the Meta/GA4 rule: no POS, free, or repeat confirmations', async () => {
    const record = vi.fn();
    for (const [before, after] of [
      [pending, { ...confirmed, source: 'pos' }],
      [pending, { ...confirmed, pricePaidCents: 0 }],
      [confirmed, confirmed],
      [undefined, pending],
    ] as const) {
      await emitMailerLiteOrderIfConfirmed(
        before,
        after,
        true,
        name,
        record,
        silentLogger,
      );
    }
    expect(record).not.toHaveBeenCalled();
  });

  it('skips a registration with no confirmation number to key the order on', async () => {
    const record = vi.fn();
    await emitMailerLiteOrderIfConfirmed(
      pending,
      { ...confirmed, confirmationNumber: undefined },
      true,
      name,
      record,
      silentLogger,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('still records the order when the class lookup fails', async () => {
    const record = vi.fn().mockResolvedValue(true);
    await emitMailerLiteOrderIfConfirmed(
      pending,
      confirmed,
      true,
      async () => {
        throw new Error('firestore down');
      },
      record,
      silentLogger,
    );
    expect(record.mock.calls[0][0].product.name).toBe('cls_1');
  });

  it('never throws when the send throws', async () => {
    await expect(
      emitMailerLiteOrderIfConfirmed(
        pending,
        confirmed,
        true,
        name,
        async () => {
          throw new Error('boom');
        },
        silentLogger,
      ),
    ).resolves.toBe(false);
  });
});
