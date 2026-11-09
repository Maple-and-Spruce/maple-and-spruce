import { describe, it, expect, vi, beforeEach } from 'vitest';

const giftCardsService = {
  listGiftCards: vi.fn(),
  listActivities: vi.fn(),
  listCardHistory: vi.fn(),
  getGiftCard: vi.fn(),
  getGiftCardCode: vi.fn(),
};

vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(function () {
    return { giftCardsService };
  }),
}));

const repos = vi.hoisted(() => ({
  GiftCardPurchaseRepository: { findByGiftCardId: vi.fn(), findBySources: vi.fn() },
  ClassCategoryRepository: { findById: vi.fn() },
}));
vi.mock('@maple/firebase/database', () => repos);

vi.mock('@maple/firebase/functions', () => ({
  throwInvalidArgument: (message: string) => {
    throw Object.assign(new Error(message), { code: 'invalid-argument' });
  },
  throwNotFound: (entity: string, id: string) => {
    throw Object.assign(new Error(`${entity} ${id} not found`), { code: 'not-found' });
  },
}));

import { getGiftCard, getGiftCards, revealGiftCardCode } from './gift-cards.handlers';

const secrets = { SQUARE_ACCESS_TOKEN: 't' };
const strings = { SQUARE_ENV: 'LOCAL', SQUARE_LOCATION_ID: 'L', SALES_TAX_RATE: '6' };
const card = {
  id: 'gc-1',
  last4: '1111',
  kind: 'egift' as const,
  state: 'active' as const,
  balanceCents: 5000,
  createdAt: '2026-11-02T15:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  repos.GiftCardPurchaseRepository.findBySources.mockResolvedValue([]);
});

describe('getGiftCards', () => {
  it('returns every card with totals from this month in Eastern time', async () => {
    giftCardsService.listGiftCards.mockResolvedValue([card]);
    giftCardsService.listActivities.mockResolvedValue([
      {
        id: 'a',
        giftCardId: 'gc-1',
        type: 'activate',
        amountCents: 5000,
        balanceAfterCents: 5000,
        createdAt: '2026-11-02T15:00:00Z',
      },
    ]);
    const now = new Date('2026-11-20T12:00:00Z');

    const result = await getGiftCards({}, {}, secrets, strings, now);

    expect(giftCardsService.listActivities).toHaveBeenCalledWith({
      beginTime: new Date('2026-11-01T04:00:00Z'),
      endTime: now,
    });
    expect(result).toEqual({
      cards: [card],
      monthStartedAt: '2026-11-01T04:00:00.000Z',
      totals: {
        outstandingCents: 5000,
        cardsWithBalance: 1,
        loadedThisMonthCents: 5000,
        spentThisMonthCents: 0,
        givenFreeThisMonthCents: 0,
        printedNotSoldCount: 0,
      },
    });
  });

  it('labels free and printed cards and splits the totals with one record query (#314, #332)', async () => {
    // Printed with no money on it, waiting to be sold at the register.
    const stock = { ...card, id: 'gc-stock', state: 'pending' as const, balanceCents: 0 };
    const free = { ...card, id: 'gc-free', balanceCents: 2500 };
    giftCardsService.listGiftCards.mockResolvedValue([card, stock, free]);
    giftCardsService.listActivities.mockResolvedValue([
      { id: 'a2', giftCardId: 'gc-free', type: 'activate', amountCents: 2500, balanceAfterCents: 2500, createdAt: '2026-11-03T15:00:00Z' },
    ]);
    repos.GiftCardPurchaseRepository.findBySources.mockResolvedValue([
      { giftCardId: 'gc-stock', last4: '1111', kind: 'amount', valueCents: 2500, source: 'stock', batchId: 'cert-1', createdAt: new Date() },
      { giftCardId: 'gc-free', last4: '1111', kind: 'amount', valueCents: 2500, source: 'issued', createdAt: new Date() },
    ]);

    const result = await getGiftCards({}, {}, secrets, strings, new Date('2026-11-20T12:00:00Z'));

    expect(repos.GiftCardPurchaseRepository.findBySources).toHaveBeenCalledTimes(1);
    expect(repos.GiftCardPurchaseRepository.findBySources).toHaveBeenCalledWith(['issued', 'stock', 'replacement']);
    expect(repos.GiftCardPurchaseRepository.findByGiftCardId).not.toHaveBeenCalled();
    expect(result.cards).toEqual([
      card,
      { ...stock, source: 'stock', batchId: 'cert-1' },
      { ...free, source: 'issued' },
    ]);
    expect(result.totals).toMatchObject({
      outstandingCents: 5000 + 2500,
      printedNotSoldCount: 1,
      givenFreeThisMonthCents: 2500,
      loadedThisMonthCents: 0,
    });
  });

  it('still answers when the records cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    giftCardsService.listGiftCards.mockResolvedValue([card]);
    giftCardsService.listActivities.mockResolvedValue([]);
    repos.GiftCardPurchaseRepository.findBySources.mockRejectedValue(new Error('down'));

    const result = await getGiftCards({}, {}, secrets, strings, new Date('2026-11-20T12:00:00Z'));

    expect(result.cards).toEqual([card]);
    expect(result.totals.outstandingCents).toBe(5000);
  });
});

describe('getGiftCard', () => {
  it('reads the whole history back to when the card was made', async () => {
    giftCardsService.getGiftCard.mockResolvedValue(card);
    giftCardsService.listCardHistory.mockResolvedValue([]);

    const result = await getGiftCard({ id: 'gc-1' }, {}, secrets, strings);

    expect(giftCardsService.listCardHistory).toHaveBeenCalledWith('gc-1', '2026-11-02T15:00:00Z');
    expect(result).toEqual({ card, activities: [] });
  });

  it('adds the online purchase record, with the class type for a certificate', async () => {
    giftCardsService.getGiftCard.mockResolvedValue(card);
    giftCardsService.listCardHistory.mockResolvedValue([]);
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockResolvedValue({
      giftCardId: 'gc-1',
      last4: '1111',
      kind: 'class',
      valueCents: 6500,
      classId: 'class-1',
      classCategoryId: 'cat-1',
      className: 'Beginner Wheel',
      buyerName: 'Robin Ashfield',
      buyerEmail: 'robin@example.com',
      deliverTo: 'buyer',
      squareOrderId: 'o',
      squarePaymentId: 'p',
      createdAt: new Date('2026-11-02T15:00:00Z'),
    });
    repos.ClassCategoryRepository.findById.mockResolvedValue({ id: 'cat-1', name: 'Pottery' });

    const result = await getGiftCard({ id: 'gc-1' }, {}, secrets, strings);

    expect(result.purchase).toMatchObject({
      kind: 'class',
      className: 'Beginner Wheel',
      classCategoryName: 'Pottery',
      createdAt: '2026-11-02T15:00:00.000Z',
    });
  });

  it('leaves the purchase off when the record cannot be read', async () => {
    giftCardsService.getGiftCard.mockResolvedValue(card);
    giftCardsService.listCardHistory.mockResolvedValue([]);
    repos.GiftCardPurchaseRepository.findByGiftCardId.mockRejectedValue(new Error('down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await getGiftCard({ id: 'gc-1' }, {}, secrets, strings);

    expect(result).toEqual({ card, activities: [] });
    err.mockRestore();
  });

  it('is not-found for an unknown card', async () => {
    giftCardsService.getGiftCard.mockResolvedValue(undefined);
    await expect(getGiftCard({ id: 'nope' }, {}, secrets, strings)).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('requires an id', async () => {
    await expect(getGiftCard({ id: '' }, {}, secrets, strings)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});

describe('revealGiftCardCode', () => {
  it('returns the code and logs who asked, without the code', async () => {
    giftCardsService.getGiftCardCode.mockResolvedValue('7783320000001111');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await revealGiftCardCode({ id: 'gc-1' }, { uid: 'staff-1' }, secrets, strings);

    expect(result).toEqual({ code: '7783320000001111' });
    const logged = log.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('gift_card_code_revealed');
    expect(logged).toContain('staff-1');
    expect(logged).not.toContain('7783320000001111');
    log.mockRestore();
  });

  it('is not-found for an unknown card', async () => {
    giftCardsService.getGiftCardCode.mockResolvedValue(undefined);
    await expect(
      revealGiftCardCode({ id: 'nope' }, {}, secrets, strings)
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('requires an id', async () => {
    await expect(
      revealGiftCardCode({ id: '' }, {}, secrets, strings)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
