import { describe, expect, it } from 'vitest';
import {
  giftCardActivityDirection,
  giftCardActivityLabel,
  giftCardKindLabel,
  classCertificateCushionCents,
  giftCardStateLabel,
  startOfMonthInTimeZone,
  summarizeGiftCards,
  isUnsoldPrintedCertificate,
  type GiftCardActivityEntry,
  type GiftCardSummary,
} from './gift-card';

const card = (over: Partial<GiftCardSummary>): GiftCardSummary => ({
  id: 'gc-1',
  last4: '1234',
  kind: 'egift',
  state: 'active',
  balanceCents: 0,
  createdAt: '2026-11-01T15:00:00Z',
  ...over,
});

const activity = (
  over: Partial<GiftCardActivityEntry>
): GiftCardActivityEntry => ({
  id: 'act-1',
  giftCardId: 'gc-1',
  type: 'activate',
  amountCents: 0,
  balanceAfterCents: 0,
  createdAt: '2026-11-02T15:00:00Z',
  ...over,
});

describe('summarizeGiftCards', () => {
  it('owes only what is on active cards', () => {
    const totals = summarizeGiftCards(
      [
        card({ id: 'a', balanceCents: 5000 }),
        card({ id: 'b', balanceCents: 2500 }),
        card({ id: 'c', balanceCents: 0 }),
        card({ id: 'd', balanceCents: 9900, state: 'blocked' }),
        card({ id: 'e', balanceCents: 0, state: 'pending' }),
      ],
      []
    );
    expect(totals.outstandingCents).toBe(7500);
    expect(totals.cardsWithBalance).toBe(2);
  });

  it('counts sold and reloaded money as loaded, and spends net of refunds', () => {
    const totals = summarizeGiftCards(
      [],
      [
        activity({ id: '1', type: 'activate', amountCents: 5000 }),
        activity({ id: '2', type: 'load', amountCents: 2000 }),
        activity({ id: '3', type: 'redeem', amountCents: -3000 }),
        activity({ id: '4', type: 'refund', amountCents: 1000 }),
        activity({ id: '5', type: 'adjust_increment', amountCents: 700 }),
        activity({ id: '6', type: 'block', amountCents: null }),
      ]
    );
    expect(totals.loadedThisMonthCents).toBe(7000);
    expect(totals.spentThisMonthCents).toBe(2000);
  });

  it('never reports negative spending when refunds outweigh spends', () => {
    const totals = summarizeGiftCards(
      [],
      [activity({ type: 'refund', amountCents: 1000 })]
    );
    expect(totals.spentThisMonthCents).toBe(0);
  });
});

describe('summarizeGiftCards with our records (#314, #332)', () => {
  const records = [
    { giftCardId: 'free', source: 'issued' as const, valueCents: 2500 },
    { giftCardId: 'stock-new', source: 'stock' as const, valueCents: 2500 },
    { giftCardId: 'stock-sold', source: 'stock' as const, valueCents: 2500 },
    { giftCardId: 'online', source: 'online' as const, valueCents: 4000 },
    { giftCardId: 'moved', source: 'replacement' as const, valueCents: 1800 },
  ];

  it('counts printed certificates waiting to be sold, and owes nothing on them', () => {
    const totals = summarizeGiftCards(
      [
        card({ id: 'stock-new', state: 'pending', balanceCents: 0 }),
        card({ id: 'stock-sold', balanceCents: 2500 }),
        card({ id: 'online', balanceCents: 4000 }),
        card({ id: 'free', balanceCents: 2500 }),
        card({ id: 'moved', balanceCents: 1800 }),
        card({ id: 'register', balanceCents: 500 }),
      ],
      [],
      records
    );
    expect(totals.printedNotSoldCount).toBe(1);
    expect(totals.outstandingCents).toBe(2500 + 4000 + 2500 + 1800 + 500);
    expect(totals.cardsWithBalance).toBe(5);
  });

  it('does not count a pending card with no record as a printed certificate', () => {
    const totals = summarizeGiftCards([card({ id: 'x', state: 'pending' })], [], records);
    expect(totals.printedNotSoldCount).toBe(0);
  });

  it('counts a certificate the register loaded as sold, and a free card as given', () => {
    const totals = summarizeGiftCards(
      [],
      [
        activity({ id: '1', giftCardId: 'free', type: 'activate', amountCents: 2500 }),
        activity({
          id: '2',
          giftCardId: 'stock-sold',
          type: 'activate',
          amountCents: 2500,
          orderId: 'order-register-1',
        }),
        activity({ id: '3', giftCardId: 'online', type: 'activate', amountCents: 4000 }),
        activity({ id: '4', giftCardId: 'register', type: 'activate', amountCents: 500 }),
        // A top-up on a free or printed card is someone paying for it.
        activity({ id: '5', giftCardId: 'free', type: 'load', amountCents: 1000 }),
        activity({ id: '6', giftCardId: 'stock-sold', type: 'load', amountCents: 700 }),
      ],
      records
    );
    expect(totals.givenFreeThisMonthCents).toBe(2500);
    expect(totals.loadedThisMonthCents).toBe(2500 + 4000 + 500 + 1000 + 700);
  });

  it('does not count a moved balance or a #314 pre-loaded certificate as sold', () => {
    const totals = summarizeGiftCards(
      [],
      [
        activity({ id: '1', giftCardId: 'moved', type: 'activate', amountCents: 1800 }),
        // Printed pre-loaded under #314: loaded with no order, never a sale.
        activity({ id: '2', giftCardId: 'stock-new', type: 'activate', amountCents: 2500 }),
        // The lost card's balance coming off is not spending either.
        activity({ id: '3', giftCardId: 'old', type: 'adjust_decrement', amountCents: -1800 }),
      ],
      records
    );
    expect(totals.loadedThisMonthCents).toBe(0);
    expect(totals.spentThisMonthCents).toBe(0);
    expect(totals.givenFreeThisMonthCents).toBe(0);
  });

  it('treats every card as a sale without records', () => {
    const totals = summarizeGiftCards(
      [card({ id: 'stock-new', balanceCents: 2500 })],
      [activity({ giftCardId: 'free', type: 'activate', amountCents: 2500 })]
    );
    expect(totals.loadedThisMonthCents).toBe(2500);
    expect(totals.givenFreeThisMonthCents).toBe(0);
    expect(totals.printedNotSoldCount).toBe(0);
    expect(totals.outstandingCents).toBe(2500);
  });
});

describe('isUnsoldPrintedCertificate', () => {
  const stock = { source: 'stock' as const };
  it('is true for a pending printed certificate', () => {
    expect(isUnsoldPrintedCertificate({ state: 'pending', balanceCents: 0 }, stock)).toBe(true);
  });
  it('is false for anything that is not printed stock', () => {
    expect(isUnsoldPrintedCertificate({ state: 'pending', balanceCents: 0 }, undefined)).toBe(false);
    expect(
      isUnsoldPrintedCertificate({ state: 'pending', balanceCents: 0 }, { source: 'issued' })
    ).toBe(false);
  });
  it('takes an active certificate as sold unless its history shows no load', () => {
    const active = { state: 'active' as const, balanceCents: 0 };
    expect(isUnsoldPrintedCertificate(active, stock)).toBe(false);
    expect(isUnsoldPrintedCertificate(active, stock, [])).toBe(true);
    expect(
      isUnsoldPrintedCertificate(active, stock, [{ type: 'activate', amountCents: 2500 }])
    ).toBe(false);
    expect(
      isUnsoldPrintedCertificate({ state: 'active', balanceCents: 100 }, stock, [])
    ).toBe(false);
    expect(
      isUnsoldPrintedCertificate({ state: 'deactivated', balanceCents: 0 }, stock, [])
    ).toBe(false);
  });
});

describe('giftCardActivityDirection', () => {
  it.each([
    ['activate', 1],
    ['load', 1],
    ['refund', 1],
    ['transfer_balance_to', 1],
    ['redeem', -1],
    ['clear_balance', -1],
    ['adjust_decrement', -1],
    ['transfer_balance_from', -1],
    ['block', 0],
    ['deactivate', 0],
  ] as const)('%s → %d', (type, expected) => {
    expect(giftCardActivityDirection(type)).toBe(expected);
  });
});

describe('labels', () => {
  it('says what happened in plain words', () => {
    expect(giftCardActivityLabel('activate')).toBe('Sold');
    expect(giftCardActivityLabel('redeem')).toBe('Spent');
    expect(giftCardStateLabel('pending')).toBe('Not sold yet');
    expect(giftCardKindLabel('egift')).toBe('eGift card');
    expect(giftCardKindLabel('plastic')).toBe('Plastic card');
  });
});

describe('startOfMonthInTimeZone', () => {
  it('is midnight on the 1st in Eastern time (EST)', () => {
    const start = startOfMonthInTimeZone(new Date('2026-11-20T12:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('is midnight on the 1st in Eastern time (EDT, after the change)', () => {
    // Nov 1 2026 is the DST change day, at 2am; midnight was still EDT.
    const start = startOfMonthInTimeZone(new Date('2026-10-15T12:00:00Z'));
    expect(start.toISOString()).toBe('2026-10-01T04:00:00.000Z');
  });

  it('treats 8pm on Nov 30 in Eastern time as still November', () => {
    // 01:00Z on Dec 1 is 8pm Nov 30 in New York.
    const start = startOfMonthInTimeZone(new Date('2026-12-01T01:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });

  it('handles January in winter time', () => {
    const start = startOfMonthInTimeZone(new Date('2027-01-10T12:00:00Z'));
    expect(start.toISOString()).toBe('2027-01-01T05:00:00.000Z');
  });
});

describe('classCertificateCushionCents', () => {
  const pottery = { kind: 'class' as const, valueCents: 6000, classCategoryId: 'cat-pottery' };

  it('covers a class up to 10% dearer in full', () => {
    expect(
      classCertificateCushionCents({
        purchase: pottery,
        classCategoryId: 'cat-pottery',
        classPriceCents: 6600,
        balanceCents: 6000,
      })
    ).toBe(600);
  });

  it('covers 10% of a dearer class and leaves the rest to pay', () => {
    expect(
      classCertificateCushionCents({
        purchase: pottery,
        classCategoryId: 'cat-pottery',
        classPriceCents: 7500,
        balanceCents: 6000,
      })
    ).toBe(600);
  });

  it('covers nothing when the card already covers the class', () => {
    expect(
      classCertificateCushionCents({
        purchase: pottery,
        classCategoryId: 'cat-pottery',
        classPriceCents: 5000,
        balanceCents: 6000,
      })
    ).toBe(0);
  });

  it('covers nothing for another class type or a dollar card', () => {
    const base = { classPriceCents: 6600, balanceCents: 6000 };
    expect(
      classCertificateCushionCents({ ...base, purchase: pottery, classCategoryId: 'cat-fiber' })
    ).toBe(0);
    expect(
      classCertificateCushionCents({
        ...base,
        purchase: { kind: 'amount', valueCents: 6000 },
        classCategoryId: 'cat-pottery',
      })
    ).toBe(0);
    expect(
      classCertificateCushionCents({ ...base, purchase: undefined, classCategoryId: 'cat-pottery' })
    ).toBe(0);
  });

  it('caps at 10% of the value even after the card was partly spent', () => {
    expect(
      classCertificateCushionCents({
        purchase: pottery,
        classCategoryId: 'cat-pottery',
        classPriceCents: 6000,
        balanceCents: 1000,
      })
    ).toBe(600);
  });
});
