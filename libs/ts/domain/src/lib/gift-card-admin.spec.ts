import { describe, expect, it } from 'vitest';
import {
  isAllowedIssuedGiftCardAmount,
  originalGiftCardValueCents,
} from './gift-card-admin';
import { giftCardPurchaseSource, type GiftCardActivityEntry } from './gift-card';

function activity(
  over: Partial<GiftCardActivityEntry> & Pick<GiftCardActivityEntry, 'type'>
): GiftCardActivityEntry {
  return {
    id: `a-${Math.random()}`,
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
