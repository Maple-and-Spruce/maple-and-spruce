import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GiftCardsService,
  isGiftCardCodeTakenError,
  toGiftCardActivityEntry,
  toGiftCardSummary,
} from './gift-cards.service';

/** An async-iterable stand-in for the SDK's Page. */
function page<T>(items: T[]): AsyncIterable<T> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

interface MockClient {
  giftCards: {
    list: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    getFromNonce: ReturnType<typeof vi.fn>;
    activities: {
      list: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
    };
  };
}

describe('GiftCardsService', () => {
  let client: MockClient;
  let service: GiftCardsService;

  beforeEach(() => {
    client = {
      giftCards: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        getFromNonce: vi.fn(),
        activities: { list: vi.fn(), create: vi.fn() },
      },
    };
    service = new GiftCardsService(client as never);
  });

  it('lists every card newest first, without the full code', async () => {
    client.giftCards.list.mockResolvedValue(
      page([
        {
          id: 'old',
          type: 'DIGITAL',
          state: 'ACTIVE',
          gan: '7783320000001111',
          balanceMoney: { amount: BigInt(2500), currency: 'USD' },
          createdAt: '2026-11-01T10:00:00Z',
        },
        {
          id: 'new',
          type: 'PHYSICAL',
          state: 'PENDING',
          gan: '7783320000002222',
          createdAt: '2026-11-05T10:00:00Z',
        },
      ]),
    );

    const cards = await service.listGiftCards();

    expect(cards.map((c) => c.id)).toEqual(['new', 'old']);
    expect(cards[1]).toEqual({
      id: 'old',
      last4: '1111',
      kind: 'egift',
      state: 'active',
      balanceCents: 2500,
      createdAt: '2026-11-01T10:00:00Z',
    });
    expect(cards[0]).toMatchObject({
      kind: 'plastic',
      state: 'pending',
      balanceCents: 0,
    });
    expect(JSON.stringify(cards)).not.toContain('7783320000001111');
  });

  it('returns the full code only from getGiftCardCode', async () => {
    client.giftCards.get.mockResolvedValue({
      giftCard: { id: 'gc', type: 'DIGITAL', gan: '7783320000003333' },
    });
    await expect(service.getGiftCardCode('gc')).resolves.toBe(
      '7783320000003333',
    );
    expect(client.giftCards.get).toHaveBeenCalledWith({ id: 'gc' });
  });

  it('treats an unknown card id as not found', async () => {
    client.giftCards.get.mockRejectedValue(
      Object.assign(new Error('Not found'), { statusCode: 404 }),
    );
    await expect(service.getGiftCard('missing')).resolves.toBeUndefined();
    await expect(service.getGiftCardCode('missing')).resolves.toBeUndefined();
  });

  it('rethrows other Square failures', async () => {
    client.giftCards.get.mockRejectedValue(
      Object.assign(new Error('boom'), { statusCode: 500 }),
    );
    await expect(service.getGiftCard('gc')).rejects.toThrow('boom');
  });

  it('passes the window and card to the activity list, newest first', async () => {
    client.giftCards.activities.list.mockResolvedValue(
      page([
        {
          id: 'a1',
          type: 'REDEEM',
          locationId: 'L1',
          giftCardId: 'gc',
          redeemActivityDetails: { amountMoney: { amount: BigInt(1500) } },
          giftCardBalanceMoney: { amount: BigInt(1000) },
          createdAt: '2026-11-03T12:00:00Z',
        },
      ]),
    );
    const begin = new Date('2026-11-01T04:00:00Z');

    const entries = await service.listActivities({
      giftCardId: 'gc',
      beginTime: begin,
    });

    expect(client.giftCards.activities.list).toHaveBeenCalledWith(
      expect.objectContaining({
        giftCardId: 'gc',
        beginTime: '2026-11-01T04:00:00.000Z',
        sortOrder: 'DESC',
      }),
    );
    expect(entries).toEqual([
      {
        id: 'a1',
        giftCardId: 'gc',
        type: 'redeem',
        amountCents: -1500,
        balanceAfterCents: 1000,
        createdAt: '2026-11-03T12:00:00Z',
      },
    ]);
  });
});

describe('GiftCardsService writes', () => {
  let client: MockClient;
  let service: GiftCardsService;

  beforeEach(() => {
    client = {
      giftCards: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        getFromNonce: vi.fn(),
        activities: { list: vi.fn(), create: vi.fn() },
      },
    };
    service = new GiftCardsService(client as never);
  });

  it('creates an eGift card and returns its code once', async () => {
    client.giftCards.create.mockResolvedValue({
      giftCard: {
        id: 'gc-new',
        type: 'DIGITAL',
        gan: '7783320000005555',
        state: 'PENDING',
      },
    });

    const card = await service.createDigitalGiftCard({
      locationId: 'L1',
      idempotencyKey: 'k1',
    });

    expect(client.giftCards.create).toHaveBeenCalledWith({
      idempotencyKey: 'k1',
      locationId: 'L1',
      giftCard: { type: 'DIGITAL' },
    });
    expect(card).toEqual({
      id: 'gc-new',
      gan: '7783320000005555',
      last4: '5555',
    });
  });

  it('fails loudly when Square reports an error creating a card', async () => {
    client.giftCards.create.mockResolvedValue({
      errors: [{ code: 'BAD_REQUEST', detail: 'nope' }],
    });
    await expect(
      service.createDigitalGiftCard({ locationId: 'L1', idempotencyKey: 'k1' }),
    ).rejects.toThrow('Square could not create gift card: nope');
  });

  it('activates a card from the order line that sold it', async () => {
    client.giftCards.activities.create.mockResolvedValue({
      giftCardActivity: { giftCardBalanceMoney: { amount: BigInt(5000) } },
    });

    const result = await service.activateGiftCard({
      giftCardId: 'gc-new',
      locationId: 'L1',
      orderId: 'order-1',
      lineItemUid: 'line-1',
      idempotencyKey: 'k2',
    });

    expect(client.giftCards.activities.create).toHaveBeenCalledWith({
      idempotencyKey: 'k2',
      giftCardActivity: {
        type: 'ACTIVATE',
        locationId: 'L1',
        giftCardId: 'gc-new',
        activateActivityDetails: { orderId: 'order-1', lineItemUid: 'line-1' },
      },
    });
    expect(result).toEqual({ balanceCents: 5000 });
  });

  it('activates a free card with an amount and no order (#310)', async () => {
    client.giftCards.activities.create.mockResolvedValue({
      giftCardActivity: { giftCardBalanceMoney: { amount: BigInt(2500) } },
    });

    const result = await service.activateGiftCardWithoutOrder({
      giftCardId: 'gc-free',
      locationId: 'L1',
      amountCents: 2500,
      referenceId: 'comp-abc123',
      buyerPaymentInstrumentIds: ['comp-abc123'],
      idempotencyKey: 'k3',
    });

    expect(client.giftCards.activities.create).toHaveBeenCalledWith({
      idempotencyKey: 'k3',
      giftCardActivity: {
        type: 'ACTIVATE',
        locationId: 'L1',
        giftCardId: 'gc-free',
        activateActivityDetails: {
          amountMoney: { amount: BigInt(2500), currency: 'USD' },
          referenceId: 'comp-abc123',
          buyerPaymentInstrumentIds: ['comp-abc123'],
        },
      },
    });
    const details =
      client.giftCards.activities.create.mock.calls[0][0].giftCardActivity
        .activateActivityDetails;
    expect(details).not.toHaveProperty('orderId');
    expect(result).toEqual({ balanceCents: 2500 });
  });

  it.each([0, -100, 12.5])(
    'refuses to activate a free card with %s cents, before calling Square',
    async (amountCents) => {
      await expect(
        service.activateGiftCardWithoutOrder({
          giftCardId: 'gc-free',
          locationId: 'L1',
          amountCents,
          referenceId: 'comp-x',
          buyerPaymentInstrumentIds: ['comp-x'],
          idempotencyKey: 'k3',
        }),
      ).rejects.toThrow('positive whole number');
      expect(client.giftCards.activities.create).not.toHaveBeenCalled();
    },
  );

  it('fails loudly when Square refuses a free card activation', async () => {
    client.giftCards.activities.create.mockResolvedValue({
      errors: [{ code: 'INVALID_GIFT_CARD_STATE', detail: 'already active' }],
    });
    await expect(
      service.activateGiftCardWithoutOrder({
        giftCardId: 'gc-free',
        locationId: 'L1',
        amountCents: 2500,
        referenceId: 'comp-x',
        buyerPaymentInstrumentIds: ['comp-x'],
        idempotencyKey: 'k3',
      }),
    ).rejects.toThrow('Square could not activate gift card: already active');
  });

  it('reports a zero balance when Square leaves the balance out', async () => {
    client.giftCards.activities.create.mockResolvedValue({
      giftCardActivity: {},
    });
    await expect(
      service.activateGiftCardWithoutOrder({
        giftCardId: 'gc-free',
        locationId: 'L1',
        amountCents: 2500,
        referenceId: 'comp-x',
        buyerPaymentInstrumentIds: ['comp-x'],
        idempotencyKey: 'k3',
      }),
    ).resolves.toEqual({ balanceCents: 0 });
  });

  it('reads the card behind a payment token', async () => {
    client.giftCards.getFromNonce.mockResolvedValue({
      giftCard: {
        id: 'gc',
        type: 'DIGITAL',
        state: 'ACTIVE',
        gan: '7783320000006666',
        balanceMoney: { amount: BigInt(4000) },
      },
    });
    await expect(service.getGiftCardFromNonce('gftok')).resolves.toMatchObject({
      id: 'gc',
      balanceCents: 4000,
      last4: '6666',
    });
  });

  it('returns undefined for a token that matches no card', async () => {
    client.giftCards.getFromNonce.mockRejectedValue(
      Object.assign(new Error('x'), { statusCode: 404 }),
    );
    await expect(service.getGiftCardFromNonce('bad')).resolves.toBeUndefined();
  });
});

describe('toGiftCardSummary', () => {
  it('skips a card with no id', () => {
    expect(toGiftCardSummary({ type: 'DIGITAL' } as never)).toBeUndefined();
  });

  it('reads blocked and turned-off states', () => {
    expect(
      toGiftCardSummary({ id: 'x', type: 'DIGITAL', state: 'BLOCKED' })?.state,
    ).toBe('blocked');
    expect(
      toGiftCardSummary({ id: 'x', type: 'DIGITAL', state: 'DEACTIVATED' })
        ?.state,
    ).toBe('deactivated');
  });
});

describe('toGiftCardActivityEntry', () => {
  it('signs money put on the card as positive', () => {
    const entry = toGiftCardActivityEntry({
      id: 'a',
      type: 'ACTIVATE',
      locationId: 'L1',
      giftCardId: 'gc',
      activateActivityDetails: { amountMoney: { amount: BigInt(5000) } },
      giftCardBalanceMoney: { amount: BigInt(5000) },
    });
    expect(entry).toMatchObject({
      type: 'activate',
      amountCents: 5000,
      balanceAfterCents: 5000,
    });
  });

  it('keeps a no-money activity with a null amount', () => {
    const entry = toGiftCardActivityEntry({
      id: 'b',
      type: 'BLOCK',
      locationId: 'L1',
    });
    expect(entry).toMatchObject({
      type: 'block',
      amountCents: null,
      balanceAfterCents: null,
    });
  });

  it('skips activity types it does not know', () => {
    expect(
      toGiftCardActivityEntry({
        id: 'c',
        type: 'SOMETHING_NEW' as never,
        locationId: 'L1',
      }),
    ).toBeUndefined();
  });
});

describe('GiftCardsService.listCardHistory', () => {
  const activity = (id: string) => ({
    id,
    type: 'ACTIVATE',
    locationId: 'L1',
    giftCardId: 'gc',
    activateActivityDetails: { amountMoney: { amount: BigInt(2500) } },
  });

  let list: ReturnType<typeof vi.fn>;
  let service: GiftCardsService;
  beforeEach(() => {
    list = vi.fn();
    service = new GiftCardsService({
      giftCards: { activities: { list } },
    } as never);
  });

  it('reads a card under a year old with no time range, which Square always accepts', async () => {
    list.mockResolvedValue(page([activity('a1')]));
    const now = new Date('2026-11-08T20:00:00Z');

    const entries = await service.listCardHistory(
      'gc',
      '2026-11-08T19:00:00Z',
      now,
    );

    expect(list).toHaveBeenCalledTimes(1);
    const req = list.mock.calls[0][0];
    expect(req.giftCardId).toBe('gc');
    expect(req.beginTime).toBeUndefined();
    expect(req.endTime).toBeUndefined();
    expect(entries.map((e) => e.id)).toEqual(['a1']);
  });

  it('reads an older card in windows that each have a start and an end, without duplicates', async () => {
    list
      .mockResolvedValueOnce(page([activity('a3'), activity('a2')]))
      .mockResolvedValueOnce(page([activity('a2'), activity('a1')]));
    const now = new Date('2026-11-08T20:00:00Z');

    const entries = await service.listCardHistory(
      'gc',
      '2025-06-01T00:00:00Z',
      now,
    );

    expect(list).toHaveBeenCalledTimes(2);
    for (const [req] of list.mock.calls) {
      expect(req.beginTime).toEqual(expect.any(String));
      expect(req.endTime).toEqual(expect.any(String));
      expect(Date.parse(req.beginTime)).toBeLessThan(Date.parse(req.endTime));
    }
    expect(list.mock.calls[0][0].endTime).toBe(now.toISOString());
    expect(Date.parse(list.mock.calls[1][0].beginTime)).toBeLessThanOrEqual(
      Date.parse('2025-06-01T00:00:00Z'),
    );
    expect(entries.map((e) => e.id)).toEqual(['a3', 'a2', 'a1']);
  });

  it('falls back to no range when the creation date is missing', async () => {
    list.mockResolvedValue(page([]));
    await service.listCardHistory('gc', '');
    expect(list.mock.calls[0][0].beginTime).toBeUndefined();
  });
});

describe('GiftCardsService #332 additions', () => {
  let client: MockClient;
  let service: GiftCardsService;
  beforeEach(() => {
    client = {
      giftCards: {
        list: vi.fn(),
        get: vi.fn(),
        create: vi.fn(),
        getFromNonce: vi.fn(),
        activities: { list: vi.fn(), create: vi.fn() },
      },
    };
    service = new GiftCardsService(client as never);
  });

  it('reads the customers linked to a card', async () => {
    client.giftCards.get.mockResolvedValue({
      giftCard: { id: 'gc', customerIds: ['c1'] },
    });
    expect(await service.getLinkedCustomerIds('gc')).toEqual(['c1']);
    client.giftCards.get.mockResolvedValue({ giftCard: { id: 'gc' } });
    expect(await service.getLinkedCustomerIds('gc')).toEqual([]);
  });

  it("lists one customer's cards, newest first", async () => {
    client.giftCards.list.mockResolvedValue(
      page([
        {
          id: 'a',
          gan: '7783320000001111',
          state: 'ACTIVE',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'b',
          gan: '7783320000002222',
          state: 'ACTIVE',
          createdAt: '2026-02-01T00:00:00Z',
        },
      ]),
    );
    const cards = await service.listGiftCardsForCustomer('cust-1');
    expect(client.giftCards.list).toHaveBeenCalledWith({
      customerId: 'cust-1',
      limit: 200,
    });
    expect(cards.map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('reads activities of one type since a date in windows under a year', async () => {
    client.giftCards.activities.list.mockResolvedValue(page([]));
    const now = new Date('2026-11-08T00:00:00Z');
    await service.listActivitiesSince(
      new Date('2024-11-08T00:00:00Z'),
      'ACTIVATE',
      now,
    );
    const calls = client.giftCards.activities.list.mock.calls.map((c) => c[0]);
    expect(calls.length).toBe(3);
    for (const call of calls) {
      expect(call.type).toBe('ACTIVATE');
      expect(
        Date.parse(call.endTime) - Date.parse(call.beginTime),
      ).toBeLessThanOrEqual(360 * 24 * 60 * 60 * 1000);
    }
    expect(calls[2].beginTime).toBe('2024-11-08T00:00:00.000Z');
  });

  it('takes money off with ADJUST_DECREMENT for a support issue', async () => {
    client.giftCards.activities.create.mockResolvedValue({
      giftCardActivity: {
        giftCardBalanceMoney: { amount: BigInt(0), currency: 'USD' },
      },
    });
    const result = await service.adjustDecrement({
      giftCardId: 'gc',
      locationId: 'L',
      amountCents: 1800,
      idempotencyKey: 'k',
    });
    expect(result).toEqual({ balanceCents: 0 });
    expect(client.giftCards.activities.create).toHaveBeenCalledWith({
      idempotencyKey: 'k',
      giftCardActivity: {
        type: 'ADJUST_DECREMENT',
        locationId: 'L',
        giftCardId: 'gc',
        adjustDecrementActivityDetails: {
          amountMoney: { amount: BigInt(1800), currency: 'USD' },
          reason: 'SUPPORT_ISSUE',
        },
      },
    });
  });

  it('refuses a non-positive decrement before calling Square', async () => {
    await expect(
      service.adjustDecrement({
        giftCardId: 'gc',
        locationId: 'L',
        amountCents: 0,
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow();
    expect(client.giftCards.activities.create).not.toHaveBeenCalled();
  });

  it('turns a card off with DEACTIVATE and reports Square errors', async () => {
    client.giftCards.activities.create.mockResolvedValue({});
    await service.deactivate({
      giftCardId: 'gc',
      locationId: 'L',
      idempotencyKey: 'k',
    });
    expect(
      client.giftCards.activities.create.mock.calls[0][0].giftCardActivity,
    ).toEqual({
      type: 'DEACTIVATE',
      locationId: 'L',
      giftCardId: 'gc',
      deactivateActivityDetails: { reason: 'UNKNOWN_REASON' },
    });
    client.giftCards.activities.create.mockResolvedValue({
      errors: [{ code: 'INVALID_GIFT_CARD_STATE', detail: 'already off' }],
    });
    await expect(
      service.deactivate({
        giftCardId: 'gc',
        locationId: 'L',
        idempotencyKey: 'k2',
      }),
    ).rejects.toThrow(/already off/);
  });

  it('carries the order that activated or loaded a card', () => {
    expect(
      toGiftCardActivityEntry({
        id: 'a',
        type: 'ACTIVATE',
        giftCardId: 'gc',
        locationId: 'L1',
        activateActivityDetails: {
          orderId: 'order-1',
          amountMoney: { amount: BigInt(2500), currency: 'USD' },
        },
      }),
    ).toMatchObject({ orderId: 'order-1', amountCents: 2500 });
    expect(
      toGiftCardActivityEntry({
        id: 'b',
        type: 'LOAD',
        giftCardId: 'gc',
        locationId: 'L1',
        loadActivityDetails: {
          orderId: 'order-2',
          amountMoney: { amount: BigInt(500), currency: 'USD' },
        },
      }),
    ).toMatchObject({ orderId: 'order-2' });
    expect(
      toGiftCardActivityEntry({
        id: 'c',
        type: 'ACTIVATE',
        giftCardId: 'gc',
        locationId: 'L1',
        activateActivityDetails: {
          amountMoney: { amount: BigInt(500), currency: 'USD' },
        },
      }),
    ).not.toHaveProperty('orderId');
  });
});

describe('isGiftCardCodeTakenError (#332)', () => {
  it('knows Square refusing a code in use', () => {
    expect(
      isGiftCardCodeTakenError(
        new Error('Square could not create gift card: GAN already exists'),
      ),
    ).toBe(true);
    expect(isGiftCardCodeTakenError({ errors: [{ code: 'CONFLICT' }] })).toBe(
      true,
    );
    expect(
      isGiftCardCodeTakenError({ errors: [{ code: 'GAN_ALREADY_EXISTS' }] }),
    ).toBe(true);
  });
  it('does not mistake other failures for it', () => {
    expect(isGiftCardCodeTakenError(new Error('Service unavailable'))).toBe(
      false,
    );
    expect(
      isGiftCardCodeTakenError({
        errors: [{ code: 'INVALID_VALUE', detail: 'bad gan' }],
      }),
    ).toBe(false);
    expect(isGiftCardCodeTakenError(null)).toBe(false);
  });
});
