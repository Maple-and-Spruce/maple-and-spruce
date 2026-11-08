import { describe, it, expect } from 'vitest';
import {
  describeGiftCardPurchase,
  formatGiftCardCode,
  formatGiftCardDollars,
  isAllowedGiftCardAmount,
} from './gift-card-purchase';

describe('isAllowedGiftCardAmount', () => {
  it.each([1000, 2500, 50000])('allows %i cents', (cents) => {
    expect(isAllowedGiftCardAmount(cents)).toBe(true);
  });

  it.each<[unknown, string]>([
    [900, 'under $10'],
    [50100, 'over $500'],
    [2550, 'not whole dollars'],
    [25.5, 'not an integer'],
    ['2500', 'not a number'],
    [undefined, 'missing'],
  ])('refuses %s (%s)', (cents) => {
    expect(isAllowedGiftCardAmount(cents)).toBe(false);
  });
});

describe('formatGiftCardCode', () => {
  it('groups the code in fours', () => {
    expect(formatGiftCardCode('7783320000001111')).toBe('7783 3200 0000 1111');
  });

  it('ignores spaces already there', () => {
    expect(formatGiftCardCode('7783 3200 00001111')).toBe('7783 3200 0000 1111');
  });
});

describe('formatGiftCardDollars', () => {
  it('drops cents on whole dollars', () => {
    expect(formatGiftCardDollars(5000)).toBe('$50');
  });

  it('keeps cents otherwise', () => {
    expect(formatGiftCardDollars(4550)).toBe('$45.50');
  });
});

describe('describeGiftCardPurchase', () => {
  it('is the amount for a dollar card', () => {
    expect(describeGiftCardPurchase({ kind: 'amount', valueCents: 5000 })).toBe('$50');
  });

  it('names the class type and class for a class certificate', () => {
    expect(
      describeGiftCardPurchase({
        kind: 'class',
        valueCents: 6500,
        className: 'Beginner Wheel',
        classCategoryName: 'Pottery',
      })
    ).toBe(
      'One Pottery class at Maple & Spruce (Beginner Wheel or any class of that type)'
    );
  });

  it('still reads when the class type or name is missing', () => {
    expect(describeGiftCardPurchase({ kind: 'class', valueCents: 6500 })).toBe(
      'One class at Maple & Spruce'
    );
  });
});
