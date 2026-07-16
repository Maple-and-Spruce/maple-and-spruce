import { describe, it, expect } from 'vitest';
import {
  computeMusicTogetherFamilyPrice,
  mtSiblingMultiplier,
} from './music-together-pricing';

/** Default MT prices: $252 full, two $132 installments. */
const week1 = new Date('2026-09-10T14:00:00.000Z');
const week5 = new Date('2026-10-08T14:00:00.000Z');
const section = {
  priceFullCents: 25200,
  installmentPlan: [
    { amountCents: 13200, dueAt: week1 },
    { amountCents: 13200, dueAt: week5 },
  ],
};

describe('mtSiblingMultiplier', () => {
  it('is 1.0 / 1.5 / 2.0 for 1 / 2 / 3 children', () => {
    expect(mtSiblingMultiplier(1)).toBe(1);
    expect(mtSiblingMultiplier(2)).toBe(1.5);
    expect(mtSiblingMultiplier(3)).toBe(2);
  });

  it('rejects counts outside 1..MT_MAX_CHILDREN', () => {
    expect(() => mtSiblingMultiplier(0)).toThrow(RangeError);
    expect(() => mtSiblingMultiplier(4)).toThrow(RangeError);
    expect(() => mtSiblingMultiplier(-1)).toThrow(RangeError);
  });

  it('rejects non-integer counts', () => {
    expect(() => mtSiblingMultiplier(1.5)).toThrow(RangeError);
    expect(() => mtSiblingMultiplier(NaN)).toThrow(RangeError);
  });
});

describe('computeMusicTogetherFamilyPrice', () => {
  // The exact owner-confirmed table (issue #599):
  //   Children | Pay in full | Each installment
  //   1        | $252        | $132
  //   2        | $378        | $198
  //   3        | $504        | $264
  it.each([
    [1, 25200, 13200],
    [2, 37800, 19800],
    [3, 50400, 26400],
  ])(
    '%i child(ren): full = %i cents, each installment = %i cents',
    (numChildren, expectedFull, expectedInstallment) => {
      const price = computeMusicTogetherFamilyPrice(section, numChildren);
      expect(price.fullCents).toBe(expectedFull);
      expect(price.installments).toHaveLength(2);
      expect(price.installments[0].amountCents).toBe(expectedInstallment);
      expect(price.installments[1].amountCents).toBe(expectedInstallment);
    }
  );

  it('reports the number of children and the multiplier applied', () => {
    expect(computeMusicTogetherFamilyPrice(section, 3).multiplier).toBe(2);
    expect(computeMusicTogetherFamilyPrice(section, 2).numChildren).toBe(2);
  });

  it('preserves each installment dueAt untouched', () => {
    const price = computeMusicTogetherFamilyPrice(section, 3);
    expect(price.installments[0].dueAt).toBe(week1);
    expect(price.installments[1].dueAt).toBe(week5);
  });

  it('preserves ISO-string dueAt (public/widget section shape)', () => {
    const publicSection = {
      priceFullCents: 25200,
      installmentPlan: [
        { amountCents: 13200, dueAt: '2026-09-10T14:00:00.000Z' },
        { amountCents: 13200, dueAt: '2026-10-08T14:00:00.000Z' },
      ],
    };
    const price = computeMusicTogetherFamilyPrice(publicSection, 2);
    expect(price.installments[0].amountCents).toBe(19800);
    expect(price.installments[0].dueAt).toBe('2026-09-10T14:00:00.000Z');
  });

  it('handles a section with no installment plan (pay-in-full only)', () => {
    const price = computeMusicTogetherFamilyPrice(
      { priceFullCents: 25200 },
      2
    );
    expect(price.fullCents).toBe(37800);
    expect(price.installments).toEqual([]);
  });

  it('rounds to whole cents rather than leaving fractional cents', () => {
    // An odd base price × 1.5 would be fractional without rounding.
    // 33333 * 1.5 = 49999.5 → 50000; 13333 * 1.5 = 19999.5 → 20000.
    const odd = {
      priceFullCents: 33333,
      installmentPlan: [{ amountCents: 13333, dueAt: week1 }],
    };
    const price = computeMusicTogetherFamilyPrice(odd, 2);
    expect(price.fullCents).toBe(50000);
    expect(price.installments[0].amountCents).toBe(20000);
    expect(Number.isInteger(price.fullCents)).toBe(true);
    expect(Number.isInteger(price.installments[0].amountCents)).toBe(true);
  });

  it('throws on an unsupported child count', () => {
    expect(() => computeMusicTogetherFamilyPrice(section, 4)).toThrow(
      RangeError
    );
    expect(() => computeMusicTogetherFamilyPrice(section, 0)).toThrow(
      RangeError
    );
  });
});
