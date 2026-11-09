import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/** Invented people only. */
const ROBIN = {
  id: 'cust-robin',
  givenName: 'Robin',
  familyName: 'Ashfield',
  emailAddress: 'robin@example.com',
  phoneNumber: '+13045550142',
};
const OLIVE = { id: 'cust-olive', givenName: 'Olive', familyName: 'Thompson' };

const square = vi.hoisted(() => ({
  giftCardsService: {
    getGiftCard: vi.fn(),
    listCardHistory: vi.fn(),
    getLinkedCustomerIds: vi.fn(),
    listGiftCardsForCustomer: vi.fn(),
    listActivitiesSince: vi.fn(),
  },
  ordersService: { getOrder: vi.fn(), searchOrderIdsForCustomers: vi.fn() },
  customersService: { find: vi.fn(), searchByContact: vi.fn(), findByName: vi.fn() },
}));
vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(function () {
    return { ...square, locationId: 'LOC-1' };
  }),
}));

const repos = vi.hoisted(() => ({
  GiftCardPurchaseRepository: { findByGiftCardId: vi.fn() },
}));
vi.mock('@maple/firebase/database', () => repos);

vi.mock('@maple/firebase/functions', () => ({
  throwNotFound: (entity: string, id: string) => {
    throw Object.assign(new Error(`${entity} with ID ${id} not found`), { code: 'not-found' });
  },
  throwInvalidArgument: (message: string) => {
    throw Object.assign(new Error(message), { code: 'invalid-argument' });
  },
}));

import type { GiftCardActivityEntry } from '@maple/ts/domain';
import {
  getGiftCardBuyer,
  saleActivity,
  saleSearchStart,
  searchGiftCardsByCustomer,
  toGiftCardCustomer,
} from './gift-card-customers';

const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = { SQUARE_ENV: 'LOCAL', SQUARE_LOCATION_ID: 'LOC-1', SALES_TAX_RATE: '6' };
const context = { uid: 'admin-1' };
const NOW = new Date('2026-11-08T15:00:00Z');

const card = (id: string, createdAt = '2026-10-01T15:00:00Z') => ({
  id,
  last4: id.slice(-4),
  kind: 'egift' as const,
  state: 'active' as const,
  balanceCents: 2500,
  createdAt,
});
const activity = (over: Partial<GiftCardActivityEntry>): GiftCardActivityEntry => ({
  id: 'a',
  giftCardId: 'gftc-0001',
  type: 'activate',
  amountCents: 2500,
  balanceAfterCents: 2500,
  createdAt: '2026-10-02T15:00:00Z',
  ...over,
});

let logs: string[];

beforeEach(() => {
  vi.clearAllMocks();
  repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue(undefined);
  square.giftCardsService.getGiftCard.mockImplementation(async (id: string) =>
    id === 'missing' ? undefined : card(id)
  );
  square.giftCardsService.getLinkedCustomerIds.mockResolvedValue([]);
  square.customersService.find.mockImplementation(async (id: string) =>
    id === ROBIN.id ? ROBIN : id === OLIVE.id ? OLIVE : undefined
  );
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.map(String).join(' '));
  });
});

afterEach(() => vi.restoreAllMocks());

describe('toGiftCardCustomer', () => {
  it('joins the name and keeps only what Square has', () => {
    expect(toGiftCardCustomer(ROBIN)).toEqual({
      id: 'cust-robin',
      name: 'Robin Ashfield',
      email: 'robin@example.com',
      phone: '+13045550142',
    });
    expect(toGiftCardCustomer({ id: 'c' })).toEqual({ id: 'c' });
  });
});

describe('saleActivity', () => {
  it('is the activation that came with an order', () => {
    const sold = activity({ id: 'act', orderId: 'order-1' });
    expect(saleActivity([activity({ id: 'r', type: 'redeem' }), sold])).toBe(sold);
  });
  it('falls back to the first load with an order', () => {
    const first = activity({ id: 'l1', type: 'load', orderId: 'o1', createdAt: '2026-10-03T00:00:00Z' });
    const later = activity({ id: 'l2', type: 'load', orderId: 'o2', createdAt: '2026-10-05T00:00:00Z' });
    expect(saleActivity([later, activity({ id: 'free' }), first])).toBe(first);
  });
  it('is undefined for a card no order loaded', () => {
    expect(saleActivity([activity({})])).toBeUndefined();
  });
});

describe('getGiftCardBuyer', () => {
  it('reads the customer on the order that loaded the card at the register', async () => {
    square.giftCardsService.listCardHistory.mockResolvedValue([
      activity({ id: 'r', type: 'redeem', amountCents: -500, createdAt: '2026-10-09T00:00:00Z' }),
      activity({ id: 'act', orderId: 'order-reg-1' }),
    ]);
    square.ordersService.getOrder.mockResolvedValue({ orderId: 'order-reg-1', customerId: ROBIN.id });

    const result = await getGiftCardBuyer({ id: 'gftc-0001' }, context, secrets, strings);

    expect(square.ordersService.getOrder).toHaveBeenCalledWith('order-reg-1');
    expect(result).toEqual({
      sale: {
        soldAt: '2026-10-02T15:00:00Z',
        orderId: 'order-reg-1',
        customer: {
          id: 'cust-robin',
          name: 'Robin Ashfield',
          email: 'robin@example.com',
          phone: '+13045550142',
        },
      },
      linkedCustomers: [],
    });
  });

  it('logs ids and counts only, never who the customer is', async () => {
    square.giftCardsService.listCardHistory.mockResolvedValue([activity({ orderId: 'o1' })]);
    square.ordersService.getOrder.mockResolvedValue({ orderId: 'o1', customerId: ROBIN.id });
    await getGiftCardBuyer({ id: 'gftc-0001' }, context, secrets, strings);
    const all = logs.join('\n');
    expect(all).toContain('gift_card_buyer_viewed');
    expect(all).not.toMatch(/Robin|robin@|555/);
  });

  it('has a sale with no customer when none was added at the register', async () => {
    square.giftCardsService.listCardHistory.mockResolvedValue([activity({ orderId: 'o1' })]);
    square.ordersService.getOrder.mockResolvedValue({ orderId: 'o1' });
    const result = await getGiftCardBuyer({ id: 'gftc-0001' }, context, secrets, strings);
    expect(result.sale).toEqual({ soldAt: '2026-10-02T15:00:00Z', orderId: 'o1' });
    expect(square.customersService.find).not.toHaveBeenCalled();
  });

  it('has no sale for a card no order loaded, and lists customers linked to the card', async () => {
    square.giftCardsService.listCardHistory.mockResolvedValue([activity({})]);
    square.giftCardsService.getLinkedCustomerIds.mockResolvedValue([OLIVE.id, 'cust-gone']);
    const result = await getGiftCardBuyer({ id: 'gftc-0001' }, context, secrets, strings);
    expect(result.sale).toBeUndefined();
    expect(square.ordersService.getOrder).not.toHaveBeenCalled();
    // A customer Square no longer has is left out.
    expect(result.linkedCustomers).toEqual([{ id: 'cust-olive', name: 'Olive Thompson' }]);
  });

  it('needs an id and a card that exists', async () => {
    await expect(getGiftCardBuyer({ id: '' }, context, secrets, strings)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(
      getGiftCardBuyer({ id: 'missing' }, context, secrets, strings)
    ).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('saleSearchStart', () => {
  it('is two years back', () => {
    expect(saleSearchStart(NOW).toISOString()).toBe('2024-11-08T15:00:00.000Z');
  });
});

describe('searchGiftCardsByCustomer', () => {
  const search = (query: string) =>
    searchGiftCardsByCustomer({ query }, context, secrets, strings, NOW);

  beforeEach(() => {
    square.giftCardsService.listGiftCardsForCustomer.mockResolvedValue([]);
    square.ordersService.searchOrderIdsForCustomers.mockResolvedValue(new Set());
    square.giftCardsService.listActivitiesSince.mockResolvedValue([]);
  });

  it('finds a customer by email and their cards: linked ones and ones their orders loaded', async () => {
    square.customersService.searchByContact.mockResolvedValue([ROBIN]);
    square.giftCardsService.listGiftCardsForCustomer.mockResolvedValue([
      card('gftc-link', '2026-09-01T00:00:00Z'),
    ]);
    square.ordersService.searchOrderIdsForCustomers.mockResolvedValue(new Set(['order-reg-1']));
    square.giftCardsService.listActivitiesSince.mockImplementation(async (_since, type) =>
      type === 'ACTIVATE'
        ? [
            activity({ giftCardId: 'gftc-sold', orderId: 'order-reg-1' }),
            activity({ giftCardId: 'gftc-else', orderId: 'order-other' }),
          ]
        : [activity({ giftCardId: 'gftc-link', type: 'load', orderId: 'order-reg-1' })]
    );
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockImplementation(async (id: string) =>
      id === 'gftc-sold' ? { source: 'stock', batchId: 'cert-abc' } : undefined
    );

    const result = await search('robin@example.com');

    expect(square.customersService.searchByContact).toHaveBeenCalledWith(
      'email',
      'robin@example.com',
      10
    );
    expect(square.ordersService.searchOrderIdsForCustomers).toHaveBeenCalledWith({
      locationId: 'LOC-1',
      customerIds: ['cust-robin'],
      since: new Date('2024-11-08T15:00:00Z'),
      until: NOW,
    });
    expect(square.giftCardsService.listActivitiesSince).toHaveBeenCalledWith(
      new Date('2024-11-08T15:00:00Z'),
      'ACTIVATE',
      NOW
    );
    expect(result.searchedBy).toBe('email');
    expect(result.searchedSince).toBe('2024-11-08T15:00:00.000Z');
    expect(result.matches).toEqual([
      {
        customer: expect.objectContaining({ id: 'cust-robin', name: 'Robin Ashfield' }),
        giftCardIds: ['gftc-link', 'gftc-sold'],
      },
    ]);
    // Newest first, labelled from our records; another customer's card is not there.
    expect(result.cards.map((c) => c.id)).toEqual(['gftc-sold', 'gftc-link']);
    expect(result.cards[0]).toMatchObject({ source: 'stock', batchId: 'cert-abc' });
  });

  it('searches a phone number by its digits', async () => {
    square.customersService.searchByContact.mockResolvedValue([]);
    const result = await search('(304) 555-0142');
    expect(square.customersService.searchByContact).toHaveBeenCalledWith('phone', '3045550142', 10);
    expect(result).toMatchObject({ searchedBy: 'phone', matches: [], cards: [] });
    expect(square.giftCardsService.listActivitiesSince).not.toHaveBeenCalled();
  });

  it('matches a name against recent customers, word by word', async () => {
    square.customersService.findByName.mockImplementation(async (matches) =>
      [ROBIN, OLIVE].filter((c) => matches(`${c.givenName} ${c.familyName}`))
    );
    const result = await search('ash rob');
    expect(square.customersService.findByName).toHaveBeenCalledWith(expect.any(Function), 10, 2000);
    expect(result.searchedBy).toBe('name');
    expect(result.matches.map((m) => m.customer.id)).toEqual(['cust-robin']);
  });

  it('logs counts, never the query', async () => {
    square.customersService.searchByContact.mockResolvedValue([ROBIN]);
    await search('robin@example.com');
    const line = logs.find((l) => l.includes('gift_card_customer_search'));
    expect(JSON.parse(line as string)).toMatchObject({
      searchedBy: 'email',
      customerCount: 1,
      cardCount: 0,
      uid: 'admin-1',
    });
    expect(logs.join('\n')).not.toMatch(/robin/i);
  });

  it.each([[''], ['4821'], ['R']])('refuses %j: not a name, email or phone', async (query) => {
    await expect(search(query)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('refuses a very long query', async () => {
    await expect(search(`${'a'.repeat(101)}`)).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
