import { describe, it, expect, vi, beforeEach } from 'vitest';

const giftCardsService = {
  listGiftCards: vi.fn(),
  listActivities: vi.fn(),
  getGiftCard: vi.fn(),
  getGiftCardCode: vi.fn(),
};

vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(function () {
    return { giftCardsService };
  }),
}));

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

beforeEach(() => vi.clearAllMocks());

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
      },
    });
  });
});

describe('getGiftCard', () => {
  it('reads the whole history back to when the card was made', async () => {
    giftCardsService.getGiftCard.mockResolvedValue(card);
    giftCardsService.listActivities.mockResolvedValue([]);

    const result = await getGiftCard({ id: 'gc-1' }, {}, secrets, strings);

    expect(giftCardsService.listActivities).toHaveBeenCalledWith({
      giftCardId: 'gc-1',
      beginTime: new Date('2026-11-02T15:00:00Z'),
    });
    expect(result).toEqual({ card, activities: [] });
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
