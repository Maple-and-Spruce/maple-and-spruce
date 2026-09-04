import { describe, it, expect } from 'vitest';
import {
  computeMusicTogetherFamilyPrice,
  mtApplyDiscount,
  mtSiblingMultiplier,
} from './music-together-pricing';
import type {
  AmountDiscountData,
  Discount,
  PercentDiscountData,
} from './discount';

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

// ── Discount codes ───────────────────────────────────────────────────────
//
// The pilot half-off promise (#791): a family who came to the demo pays half.
// The only reading that makes that true is "every amount is halved" — the
// Week-5 scheduled charge included.

const discountBase = {
  id: 'd1',
  code: 'PILOTCLASS',
  description: 'Pilot semester — half off',
  status: 'active' as const,
  program: 'music-together' as const,
  appliesTo: 'order' as const,
  nthSlot: 1,
  usageLimit: null,
  usageCount: 0,
  createdAt: week1,
  updatedAt: week1,
};

const halfOff: PercentDiscountData = {
  ...discountBase,
  type: 'percent',
  percent: 50,
};

describe('mtApplyDiscount', () => {
  it('halves the pay-in-full total AND every installment', () => {
    const price = computeMusicTogetherFamilyPrice(section, 1);
    const discounted = mtApplyDiscount(price, halfOff);

    expect(discounted.fullCents).toBe(12600); // $252 -> $126
    expect(discounted.installments.map((i) => i.amountCents)).toEqual([
      6600, 6600, // $132 -> $66 each, Week-5 charge included
    ]);
    expect(discounted.fullDiscountCents).toBe(12600); // $252 -> $126
    expect(discounted.installmentsDiscountCents).toBe(13200); // $264 -> $132
  });

  it('leaves a paid installment-1 family at exactly half the plan', () => {
    // Nancy's case: she paid $132 of the $264 plan before the code existed.
    // Waiving installment 2 must land her on the same total a code would.
    const price = computeMusicTogetherFamilyPrice(section, 1);
    const planTotal = price.installments.reduce(
      (sum, i) => sum + i.amountCents,
      0
    );
    const discountedPlanTotal = mtApplyDiscount(
      price,
      halfOff
    ).installments.reduce((sum, i) => sum + i.amountCents, 0);

    expect(planTotal).toBe(26400);
    expect(discountedPlanTotal).toBe(13200);
    // Installment 1 alone == the whole discounted plan.
    expect(price.installments[0].amountCents).toBe(discountedPlanTotal);
  });

  it('stacks on top of the sibling discount', () => {
    // 2 children = 1.5x, then half off: $378 -> $189, $198 -> $99 each.
    const price = computeMusicTogetherFamilyPrice(section, 2);
    const discounted = mtApplyDiscount(price, halfOff);

    expect(discounted.fullCents).toBe(18900);
    expect(discounted.installments.map((i) => i.amountCents)).toEqual([
      9900, 9900,
    ]);
    expect(discounted.numChildren).toBe(2);
    expect(discounted.multiplier).toBe(1.5);
  });

  it('preserves dueAt on every installment', () => {
    const price = computeMusicTogetherFamilyPrice(section, 1);
    const discounted = mtApplyDiscount(price, halfOff);

    expect(discounted.installments.map((i) => i.dueAt)).toEqual([week1, week5]);
  });

  it('takes a fixed amount off the plan ONCE, apportioned across installments', () => {
    // $25 off must not become $25 off each installment ($50 given away).
    const twentyFiveOff: AmountDiscountData = {
      ...discountBase,
      code: 'TWENTYFIVE',
      type: 'amount',
      amountCents: 2500,
    };
    const price = computeMusicTogetherFamilyPrice(section, 1);
    const discounted = mtApplyDiscount(price, twentyFiveOff);

    const planTotal = discounted.installments.reduce(
      (sum, i) => sum + i.amountCents,
      0
    );
    expect(planTotal).toBe(26400 - 2500);
    expect(discounted.installmentsDiscountCents).toBe(2500);
    expect(discounted.fullCents).toBe(25200 - 2500);
  });

  it('distributes an odd remainder so the parts sum exactly', () => {
    // $25.01 off $264 leaves $238.99 — not divisible by two equal shares.
    const oddAmount: AmountDiscountData = {
      ...discountBase,
      code: 'ODD',
      type: 'amount',
      amountCents: 2501,
    };
    const price = computeMusicTogetherFamilyPrice(section, 1);
    const discounted = mtApplyDiscount(price, oddAmount);

    const parts = discounted.installments.map((i) => i.amountCents);
    expect(parts.reduce((sum, p) => sum + p, 0)).toBe(26400 - 2501);
    // Leftover cent goes to the earlier installment.
    expect(parts[0]).toBe(parts[1] + 1);
  });

  it('apportions by weight when installments are uneven', () => {
    const uneven = {
      priceFullCents: 25200,
      installmentPlan: [
        { amountCents: 20000, dueAt: week1 },
        { amountCents: 6400, dueAt: week5 },
      ],
    };
    const discounted = mtApplyDiscount(
      computeMusicTogetherFamilyPrice(uneven, 1),
      halfOff
    );

    expect(discounted.installments.map((i) => i.amountCents)).toEqual([
      10000, 3200,
    ]);
  });

  it('never goes negative when the amount exceeds the price', () => {
    const huge: AmountDiscountData = {
      ...discountBase,
      code: 'HUGE',
      type: 'amount',
      amountCents: 100000,
    };
    const discounted = mtApplyDiscount(
      computeMusicTogetherFamilyPrice(section, 1),
      huge
    );

    expect(discounted.fullCents).toBe(0);
    expect(discounted.installments.map((i) => i.amountCents)).toEqual([0, 0]);
  });

  it('handles a section with no installment plan', () => {
    const fullOnly = { priceFullCents: 25200 };
    const discounted = mtApplyDiscount(
      computeMusicTogetherFamilyPrice(fullOnly, 1),
      halfOff
    );

    expect(discounted.fullCents).toBe(12600);
    expect(discounted.installments).toEqual([]);
    expect(discounted.fullDiscountCents).toBe(12600);
    // No plan to discount.
    expect(discounted.installmentsDiscountCents).toBe(0);
  });

  it('honors an expired amount-before-date cutoff (no discount)', () => {
    const earlyBird: Discount = {
      ...discountBase,
      code: 'EARLYBIRD',
      type: 'amount-before-date',
      amountCents: 5000,
      cutoffDate: new Date('2026-08-01T00:00:00.000Z'),
    };
    const price = computeMusicTogetherFamilyPrice(section, 1);
    const discounted = mtApplyDiscount(
      price,
      earlyBird,
      new Date('2026-09-03T00:00:00.000Z')
    );

    expect(discounted.fullCents).toBe(25200);
    expect(discounted.installments.map((i) => i.amountCents)).toEqual([
      13200, 13200,
    ]);
    expect(discounted.fullDiscountCents).toBe(0);
    expect(discounted.installmentsDiscountCents).toBe(0);
  });

  it('uppercases the applied code', () => {
    const lower: PercentDiscountData = { ...halfOff, code: 'pilotclass' };
    const discounted = mtApplyDiscount(
      computeMusicTogetherFamilyPrice(section, 1),
      lower
    );

    expect(discounted.discountCode).toBe('PILOTCLASS');
  });

  it('rejects a slot-scoped discount rather than over-applying it', () => {
    const perSlot: PercentDiscountData = {
      ...halfOff,
      code: 'SECONDSLOT',
      appliesTo: 'nth-slot-onward',
      nthSlot: 2,
    };

    expect(() =>
      mtApplyDiscount(computeMusicTogetherFamilyPrice(section, 1), perSlot)
    ).toThrow(RangeError);
  });
});
