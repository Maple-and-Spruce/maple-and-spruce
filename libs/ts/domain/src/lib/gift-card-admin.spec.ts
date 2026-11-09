import { describe, expect, it } from 'vitest';
import {
  isAllowedIssuedGiftCardAmount,
  originalGiftCardValueCents,
  customGiftCardCodeProblem,
  normalizeGiftCardCode,
  giftCardSearchKind,
  customerNameMatches,
} from './gift-card-admin';
import { giftCardPurchaseSource, type GiftCardActivityEntry } from './gift-card';

let activityCounter = 0;
function activity(
  over: Partial<GiftCardActivityEntry> & Pick<GiftCardActivityEntry, 'type'>
): GiftCardActivityEntry {
  return {
    id: `a-${++activityCounter}`,
    giftCardId: 'gc-1',
    amountCents: null,
    balanceAfterCents: null,
    createdAt: '2026-11-01T15:00:00Z',
    ...over,
  };
}

describe('isAllowedIssuedGiftCardAmount', () => {
  it.each([500, 2500, 50000])('allows %i cents', (cents) => {
    expect(isAllowedIssuedGiftCardAmount(cents)).toBe(true);
  });

  it.each([0, 400, 50100, 2550, 25.5, '2500', null, undefined, NaN])(
    'refuses %s',
    (cents) => {
      expect(isAllowedIssuedGiftCardAmount(cents)).toBe(false);
    }
  );
});

describe('originalGiftCardValueCents', () => {
  it('is the activation amount, not the balance after spending', () => {
    expect(
      originalGiftCardValueCents([
        activity({ type: 'redeem', amountCents: -3000, createdAt: '2026-11-05T00:00:00Z' }),
        activity({ type: 'activate', amountCents: 6500, createdAt: '2026-11-01T00:00:00Z' }),
      ])
    ).toBe(6500);
  });

  it('ignores a later reload', () => {
    expect(
      originalGiftCardValueCents([
        activity({ type: 'load', amountCents: 2000, createdAt: '2026-11-09T00:00:00Z' }),
        activity({ type: 'activate', amountCents: 5000, createdAt: '2026-11-01T00:00:00Z' }),
      ])
    ).toBe(5000);
  });

  it('falls back to the first load when there is no activation', () => {
    expect(
      originalGiftCardValueCents([
        activity({ type: 'load', amountCents: 2000, createdAt: '2026-11-09T00:00:00Z' }),
        activity({ type: 'load', amountCents: 4000, createdAt: '2026-11-02T00:00:00Z' }),
      ])
    ).toBe(4000);
  });

  it('is undefined when nothing was loaded', () => {
    expect(originalGiftCardValueCents([])).toBeUndefined();
    expect(
      originalGiftCardValueCents([activity({ type: 'activate', amountCents: null })])
    ).toBeUndefined();
  });
});

describe('giftCardPurchaseSource', () => {
  it('reads a record with no source as bought online', () => {
    expect(giftCardPurchaseSource({})).toBe('online');
    expect(giftCardPurchaseSource({ source: 'issued' })).toBe('issued');
  });
});

describe('custom gift card codes', () => {
  it('drops spaces and dashes and capitalises', () => {
    expect(normalizeGiftCardCode(' fern reel-harp 4821 ')).toBe('FERNREELHARP4821');
  });

  it.each([
    ['FERN REEL HARP 4821', undefined],
    ['7012 3456 7890', undefined],
    ['FERN', 'Use 8 to 20 letters and numbers'],
    ['FERNREELHARPMAPLE48213', 'Use 8 to 20 letters and numbers'],
    ['FERN_REEL_4821', 'Use only letters and numbers'],
    ['4111 1111 1111', 'A number-only code cannot start with 2, 3, 4, 5 or 6'],
  ])('%s → %s', (code, problem) => {
    expect(customGiftCardCodeProblem(code)).toBe(problem);
  });
});

describe('giftCardSearchKind (#332)', () => {
  it('reads up to 4 digits as the end of a card code', () => {
    expect(giftCardSearchKind('4821')).toBe('last4');
    expect(giftCardSearchKind(' 48 ')).toBe('last4');
  });
  it('reads more digits as a phone number', () => {
    expect(giftCardSearchKind('(304) 555-0142')).toBe('phone');
    expect(giftCardSearchKind('3045550142')).toBe('phone');
  });
  it('reads anything with an @ as an email', () => {
    expect(giftCardSearchKind('robin@example.com')).toBe('email');
  });
  it('reads other text as a name, from 2 characters', () => {
    expect(giftCardSearchKind('Robin Ashfield')).toBe('name');
    expect(giftCardSearchKind('R')).toBe('none');
    expect(giftCardSearchKind('  ')).toBe('none');
  });
});

describe('customerNameMatches (#332)', () => {
  it('matches when every typed word starts a word of the name', () => {
    expect(customerNameMatches('Robin Ashfield', 'robin')).toBe(true);
    expect(customerNameMatches('Robin Ashfield', 'ash rob')).toBe(true);
    expect(customerNameMatches('Robin Ashfield', 'Robin A')).toBe(true);
  });
  it('does not match inside a word or on a missing word', () => {
    expect(customerNameMatches('Robin Ashfield', 'field')).toBe(false);
    expect(customerNameMatches('Robin Ashfield', 'robin smith')).toBe(false);
    expect(customerNameMatches('Robin Ashfield', '')).toBe(false);
  });
});
