import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GIFT_CARD_AMOUNT_SETTINGS,
  describeGiftCardPurchase,
  isGiftCertificateCategory,
  toGiftCertificateClassType,
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

describe('isAllowedGiftCardAmount with limits from Settings (#309)', () => {
  const limits = { minCents: 500, maxCents: 100000 };
  it('allows the stored range', () => {
    expect(isAllowedGiftCardAmount(500, limits)).toBe(true);
    expect(isAllowedGiftCardAmount(100000, limits)).toBe(true);
  });
  it('refuses outside it', () => {
    expect(isAllowedGiftCardAmount(400, limits)).toBe(false);
    expect(isAllowedGiftCardAmount(100100, limits)).toBe(false);
  });
});

describe('DEFAULT_GIFT_CARD_AMOUNT_SETTINGS', () => {
  it('is what the buy page shipped with', () => {
    expect(DEFAULT_GIFT_CARD_AMOUNT_SETTINGS).toEqual({
      presetCents: [2500, 5000, 10000],
      minCents: 1000,
      maxCents: 50000,
    });
  });
});

describe('isGiftCertificateCategory', () => {
  const pottery = { id: 'cat-pottery', name: 'Pottery' };
  it('is true only when switched on with a positive price', () => {
    expect(
      isGiftCertificateCategory({ ...pottery, giftCertificateEnabled: true, giftCertificatePriceCents: 6500 })
    ).toBe(true);
    expect(isGiftCertificateCategory({ ...pottery, giftCertificateEnabled: true })).toBe(false);
    expect(
      isGiftCertificateCategory({ ...pottery, giftCertificateEnabled: false, giftCertificatePriceCents: 6500 })
    ).toBe(false);
    expect(
      isGiftCertificateCategory({ ...pottery, giftCertificateEnabled: true, giftCertificatePriceCents: 0 })
    ).toBe(false);
    expect(isGiftCertificateCategory(undefined)).toBe(false);
  });
});

describe('toGiftCertificateClassType', () => {
  it('takes the first pool image', () => {
    expect(
      toGiftCertificateClassType({
        id: 'cat-pottery',
        name: 'Pottery',
        giftCertificatePriceCents: 6500,
        galleryImages: [
          { url: 'https://img.example.com/a.jpg', alt: 'A bowl' },
          { url: 'https://img.example.com/b.jpg', alt: 'A mug' },
        ],
      })
    ).toEqual({
      id: 'cat-pottery',
      name: 'Pottery',
      priceCents: 6500,
      imageUrl: 'https://img.example.com/a.jpg',
      imageAlt: 'A bowl',
    });
  });

  it('leaves the image out when there is none', () => {
    expect(
      toGiftCertificateClassType({ id: 'c', name: 'Weaving', giftCertificatePriceCents: 4000 })
    ).toEqual({ id: 'c', name: 'Weaving', priceCents: 4000 });
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

  it('names only the class type for a class certificate (#309)', () => {
    expect(
      describeGiftCardPurchase({
        kind: 'class',
        valueCents: 6500,
        className: 'Beginner Wheel',
        classCategoryName: 'Pottery',
      })
    ).toBe('One Pottery class at Maple & Spruce');
  });

  it('reads the type from className when that is all it has', () => {
    expect(
      describeGiftCardPurchase({ kind: 'class', valueCents: 6500, className: 'Pottery' })
    ).toBe('One Pottery class at Maple & Spruce');
  });

  it('still reads when the class type or name is missing', () => {
    expect(describeGiftCardPurchase({ kind: 'class', valueCents: 6500 })).toBe(
      'One class at Maple & Spruce'
    );
  });
});
