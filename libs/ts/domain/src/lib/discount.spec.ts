import { describe, it, expect } from 'vitest';
import {
  applyDiscount,
  isDiscountValid,
  formatDiscount,
  DISCOUNT_TYPES,
  DISCOUNT_STATUSES,
  DISCOUNT_APPLIES_TO,
} from './discount';
import type {
  PercentDiscountData,
  AmountDiscountData,
  AmountBeforeDateDiscountData,
} from './discount';

const baseFields = {
  id: 'disc-1',
  code: 'TEST10',
  description: 'Test discount',
  status: 'active' as const,
  appliesTo: 'order' as const,
  nthSlot: 1,
  usageLimit: null,
  usageCount: 0,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('applyDiscount — appliesTo: order', () => {
  describe('percent discount', () => {
    const discount: PercentDiscountData = {
      ...baseFields,
      type: 'percent',
      percent: 10,
    };

    it('applies 10% off correctly', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(4050);
      expect(result.discountAmountCents).toBe(450);
    });

    it('applies 100% off (free)', () => {
      const fullDiscount: PercentDiscountData = { ...discount, percent: 100 };
      const result = applyDiscount(fullDiscount, {
        unitPriceCents: 4500,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(4500);
    });

    it('applies 50% off correctly', () => {
      const halfDiscount: PercentDiscountData = { ...discount, percent: 50 };
      const result = applyDiscount(halfDiscount, {
        unitPriceCents: 4500,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(2250);
      expect(result.discountAmountCents).toBe(2250);
    });

    it('rounds discount amount correctly', () => {
      // 33% of 100 = 33 cents
      const oddDiscount: PercentDiscountData = { ...discount, percent: 33 };
      const result = applyDiscount(oddDiscount, {
        unitPriceCents: 100,
        quantity: 1,
      });
      expect(result.discountAmountCents).toBe(33);
      expect(result.updatedCents).toBe(67);
    });

    it('handles 1% discount', () => {
      const smallDiscount: PercentDiscountData = { ...discount, percent: 1 };
      const result = applyDiscount(smallDiscount, {
        unitPriceCents: 4500,
        quantity: 1,
      });
      expect(result.discountAmountCents).toBe(45);
      expect(result.updatedCents).toBe(4455);
    });

    it('handles zero total', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 0,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(0);
    });

    it('applies uniformly across multiple slots', () => {
      // 10% off 2 × $45 = 10% off $90 = $9 off
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 2,
      });
      expect(result.updatedCents).toBe(8100);
      expect(result.discountAmountCents).toBe(900);
    });
  });

  describe('amount discount', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      type: 'amount',
      amountCents: 500,
    };

    it('deducts $5 from $45', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(4000);
      expect(result.discountAmountCents).toBe(500);
    });

    it('does not go below zero', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 300,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(300);
    });

    it('handles exact match (discount equals total)', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 500,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(500);
    });

    it('handles zero total', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 0,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(0);
    });

    it('applies once to multi-slot order subtotal', () => {
      // $5 off the order, regardless of slot count
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 3,
      });
      expect(result.updatedCents).toBe(13000);
      expect(result.discountAmountCents).toBe(500);
    });
  });

  describe('amount-before-date discount', () => {
    const cutoffDate = new Date('2025-06-01T00:00:00Z');
    const discount: AmountBeforeDateDiscountData = {
      ...baseFields,
      type: 'amount-before-date',
      amountCents: 1000,
      cutoffDate,
    };

    it('applies discount when before cutoff date', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      const result = applyDiscount(
        discount,
        { unitPriceCents: 4500, quantity: 1 },
        now
      );
      expect(result.updatedCents).toBe(3500);
      expect(result.discountAmountCents).toBe(1000);
    });

    it('applies discount on the cutoff date itself', () => {
      const now = new Date('2025-06-01T00:00:00Z');
      const result = applyDiscount(
        discount,
        { unitPriceCents: 4500, quantity: 1 },
        now
      );
      expect(result.updatedCents).toBe(3500);
      expect(result.discountAmountCents).toBe(1000);
    });

    it('does not apply after cutoff date', () => {
      const now = new Date('2025-06-02T00:00:00Z');
      const result = applyDiscount(
        discount,
        { unitPriceCents: 4500, quantity: 1 },
        now
      );
      expect(result.updatedCents).toBe(4500);
      expect(result.discountAmountCents).toBe(0);
    });

    it('does not go below zero before cutoff', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      const result = applyDiscount(
        discount,
        { unitPriceCents: 500, quantity: 1 },
        now
      );
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(500);
    });

    it('handles cutoff date as ISO string (Firestore deserialization)', () => {
      const discountWithStringDate = {
        ...discount,
        cutoffDate: '2025-06-01T00:00:00Z' as unknown as Date,
      };
      const now = new Date('2025-05-01T00:00:00Z');
      const result = applyDiscount(
        discountWithStringDate,
        { unitPriceCents: 4500, quantity: 1 },
        now
      );
      expect(result.updatedCents).toBe(3500);
      expect(result.discountAmountCents).toBe(1000);
    });
  });
});

describe('applyDiscount — appliesTo: nth-slot-onward', () => {
  describe('percent (50% off second slot onward)', () => {
    const discount: PercentDiscountData = {
      ...baseFields,
      appliesTo: 'nth-slot-onward',
      nthSlot: 2,
      type: 'percent',
      percent: 50,
    };

    it('does not discount when quantity is below the threshold', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 1,
      });
      expect(result.updatedCents).toBe(4500);
      expect(result.discountAmountCents).toBe(0);
    });

    it('discounts exactly one slot at quantity = nthSlot', () => {
      // qty=2, slot 2 gets 50% off → $45 + $22.50 = $67.50, $22.50 off
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 2,
      });
      expect(result.updatedCents).toBe(6750);
      expect(result.discountAmountCents).toBe(2250);
    });

    it('discounts two slots at quantity = nthSlot + 1', () => {
      // qty=3, slots 2 and 3 each get 50% off → $45 + $22.50 + $22.50 = $90, $45 off
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 3,
      });
      expect(result.updatedCents).toBe(9000);
      expect(result.discountAmountCents).toBe(4500);
    });

    it('rounds per-slot before multiplying (33% of $1 × 2 slots)', () => {
      const oddDiscount: PercentDiscountData = { ...discount, percent: 33 };
      const result = applyDiscount(oddDiscount, {
        unitPriceCents: 100,
        quantity: 3,
      });
      // per-slot: round(100 * 0.33) = 33; × 2 discounted slots = 66
      expect(result.discountAmountCents).toBe(66);
      expect(result.updatedCents).toBe(234);
    });
  });

  describe('amount ($10 off third slot onward)', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      appliesTo: 'nth-slot-onward',
      nthSlot: 3,
      type: 'amount',
      amountCents: 1000,
    };

    it('does not discount when quantity < nthSlot', () => {
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 2,
      });
      expect(result.updatedCents).toBe(9000);
      expect(result.discountAmountCents).toBe(0);
    });

    it('discounts exactly one slot at quantity = nthSlot', () => {
      // qty=3, slot 3 gets $10 off
      const result = applyDiscount(discount, {
        unitPriceCents: 4500,
        quantity: 3,
      });
      expect(result.updatedCents).toBe(12500);
      expect(result.discountAmountCents).toBe(1000);
    });

    it('caps per-slot amount at unit price (slot cannot go negative)', () => {
      // $20 off when each slot is only $5 → cap at $5 per discounted slot
      const bigAmount: AmountDiscountData = {
        ...discount,
        amountCents: 2000,
      };
      const result = applyDiscount(bigAmount, {
        unitPriceCents: 500,
        quantity: 3,
      });
      // slot 3 capped at $5 off; slots 1+2 full price = $5 + $5 + $0 = $10
      expect(result.updatedCents).toBe(1000);
      expect(result.discountAmountCents).toBe(500);
    });
  });

  describe('amount-before-date with nth-slot-onward', () => {
    const cutoffDate = new Date('2025-06-01T00:00:00Z');
    const discount: AmountBeforeDateDiscountData = {
      ...baseFields,
      appliesTo: 'nth-slot-onward',
      nthSlot: 2,
      type: 'amount-before-date',
      amountCents: 1000,
      cutoffDate,
    };

    it('applies per-slot before cutoff', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      const result = applyDiscount(
        discount,
        { unitPriceCents: 4500, quantity: 2 },
        now
      );
      expect(result.updatedCents).toBe(8000);
      expect(result.discountAmountCents).toBe(1000);
    });

    it('does not apply after cutoff', () => {
      const now = new Date('2025-06-02T00:00:00Z');
      const result = applyDiscount(
        discount,
        { unitPriceCents: 4500, quantity: 2 },
        now
      );
      expect(result.updatedCents).toBe(9000);
      expect(result.discountAmountCents).toBe(0);
    });
  });
});

describe('isDiscountValid', () => {
  describe('percent discount', () => {
    const discount: PercentDiscountData = {
      ...baseFields,
      type: 'percent',
      percent: 10,
    };

    it('returns true when active', () => {
      expect(isDiscountValid(discount)).toBe(true);
    });

    it('returns false when inactive', () => {
      const inactive = { ...discount, status: 'inactive' as const };
      expect(isDiscountValid(inactive)).toBe(false);
    });
  });

  describe('amount discount', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      type: 'amount',
      amountCents: 500,
    };

    it('returns true when active', () => {
      expect(isDiscountValid(discount)).toBe(true);
    });

    it('returns false when inactive', () => {
      const inactive = { ...discount, status: 'inactive' as const };
      expect(isDiscountValid(inactive)).toBe(false);
    });
  });

  describe('amount-before-date discount', () => {
    const cutoffDate = new Date('2025-06-01T00:00:00Z');
    const discount: AmountBeforeDateDiscountData = {
      ...baseFields,
      type: 'amount-before-date',
      amountCents: 1000,
      cutoffDate,
    };

    it('returns true when active and before cutoff', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      expect(isDiscountValid(discount, now)).toBe(true);
    });

    it('returns true on the cutoff date itself', () => {
      const now = new Date('2025-06-01T00:00:00Z');
      expect(isDiscountValid(discount, now)).toBe(true);
    });

    it('returns false when active but after cutoff', () => {
      const now = new Date('2025-06-02T00:00:00Z');
      expect(isDiscountValid(discount, now)).toBe(false);
    });

    it('returns false when inactive even before cutoff', () => {
      const inactive = { ...discount, status: 'inactive' as const };
      const now = new Date('2025-05-01T00:00:00Z');
      expect(isDiscountValid(inactive, now)).toBe(false);
    });

    it('handles cutoff date as ISO string', () => {
      const discountWithStringDate = {
        ...discount,
        cutoffDate: '2025-06-01T00:00:00Z' as unknown as Date,
      };
      const now = new Date('2025-05-01T00:00:00Z');
      expect(isDiscountValid(discountWithStringDate, now)).toBe(true);
    });
  });

  describe('usage limit', () => {
    const baseDiscount: PercentDiscountData = {
      ...baseFields,
      type: 'percent',
      percent: 10,
    };

    it('returns true when usageLimit is null (unlimited)', () => {
      expect(
        isDiscountValid({ ...baseDiscount, usageLimit: null, usageCount: 999 })
      ).toBe(true);
    });

    it('returns true when usageCount is below the limit', () => {
      expect(
        isDiscountValid({ ...baseDiscount, usageLimit: 5, usageCount: 4 })
      ).toBe(true);
    });

    it('returns false when usageCount has reached the limit', () => {
      expect(
        isDiscountValid({ ...baseDiscount, usageLimit: 1, usageCount: 1 })
      ).toBe(false);
    });

    it('returns false when usageCount has exceeded the limit', () => {
      expect(
        isDiscountValid({ ...baseDiscount, usageLimit: 5, usageCount: 7 })
      ).toBe(false);
    });
  });

  describe('expiresAt', () => {
    const baseDiscount: PercentDiscountData = {
      ...baseFields,
      type: 'percent',
      percent: 10,
    };
    const expiresAt = new Date('2025-06-01T00:00:00Z');

    it('returns true before expiry', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      expect(isDiscountValid({ ...baseDiscount, expiresAt }, now)).toBe(true);
    });

    it('returns true at the moment of expiry (boundary inclusive)', () => {
      const now = new Date('2025-06-01T00:00:00Z');
      expect(isDiscountValid({ ...baseDiscount, expiresAt }, now)).toBe(true);
    });

    it('returns false after expiry', () => {
      const now = new Date('2025-06-02T00:00:00Z');
      expect(isDiscountValid({ ...baseDiscount, expiresAt }, now)).toBe(false);
    });

    it('handles expiresAt as ISO string', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      const withString = {
        ...baseDiscount,
        expiresAt: '2025-06-01T00:00:00Z' as unknown as Date,
      };
      expect(isDiscountValid(withString, now)).toBe(true);
    });

    it('rejects expired even when usageLimit is unmet', () => {
      const now = new Date('2025-06-02T00:00:00Z');
      const withRoom = {
        ...baseDiscount,
        expiresAt,
        usageLimit: 10,
        usageCount: 0,
      };
      expect(isDiscountValid(withRoom, now)).toBe(false);
    });
  });
});

describe('formatDiscount', () => {
  it('formats percent discount', () => {
    const discount: PercentDiscountData = {
      ...baseFields,
      type: 'percent',
      percent: 10,
    };
    expect(formatDiscount(discount)).toBe('10% off');
  });

  it('formats amount discount', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      type: 'amount',
      amountCents: 500,
    };
    expect(formatDiscount(discount)).toBe('$5.00 off');
  });

  it('formats amount-before-date discount', () => {
    const discount: AmountBeforeDateDiscountData = {
      ...baseFields,
      type: 'amount-before-date',
      amountCents: 1000,
      cutoffDate: new Date('2025-06-01T00:00:00Z'),
    };
    const result = formatDiscount(discount);
    expect(result).toContain('$10.00 off');
    expect(result).toContain('before');
  });

  it('formats whole dollar amounts', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      type: 'amount',
      amountCents: 2000,
    };
    expect(formatDiscount(discount)).toBe('$20.00 off');
  });

  it('formats fractional dollar amounts', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      type: 'amount',
      amountCents: 1550,
    };
    expect(formatDiscount(discount)).toBe('$15.50 off');
  });

  it('appends "(slots N+)" for nth-slot-onward percent discounts', () => {
    const discount: PercentDiscountData = {
      ...baseFields,
      appliesTo: 'nth-slot-onward',
      nthSlot: 2,
      type: 'percent',
      percent: 50,
    };
    expect(formatDiscount(discount)).toBe('50% off (slots 2+)');
  });

  it('appends "(slots N+)" for nth-slot-onward amount discounts', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      appliesTo: 'nth-slot-onward',
      nthSlot: 3,
      type: 'amount',
      amountCents: 1000,
    };
    expect(formatDiscount(discount)).toBe('$10.00 off (slots 3+)');
  });
});

describe('DISCOUNT_TYPES', () => {
  it('contains all valid discount types', () => {
    expect(DISCOUNT_TYPES).toEqual(['percent', 'amount', 'amount-before-date']);
  });
});

describe('DISCOUNT_STATUSES', () => {
  it('contains all valid statuses', () => {
    expect(DISCOUNT_STATUSES).toEqual(['active', 'inactive']);
  });
});

describe('DISCOUNT_APPLIES_TO', () => {
  it('contains all valid applies-to values', () => {
    expect(DISCOUNT_APPLIES_TO).toEqual(['order', 'nth-slot-onward']);
  });
});
