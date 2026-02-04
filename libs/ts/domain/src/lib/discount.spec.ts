import { describe, it, expect } from 'vitest';
import {
  applyDiscount,
  isDiscountValid,
  formatDiscount,
  DISCOUNT_TYPES,
  DISCOUNT_STATUSES,
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
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

describe('applyDiscount', () => {
  describe('percent discount', () => {
    const discount: PercentDiscountData = {
      ...baseFields,
      type: 'percent',
      percent: 10,
    };

    it('applies 10% off correctly', () => {
      const result = applyDiscount(discount, 4500);
      expect(result.updatedCents).toBe(4050);
      expect(result.discountAmountCents).toBe(450);
    });

    it('applies 100% off (free)', () => {
      const fullDiscount: PercentDiscountData = {
        ...discount,
        percent: 100,
      };
      const result = applyDiscount(fullDiscount, 4500);
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(4500);
    });

    it('applies 50% off correctly', () => {
      const halfDiscount: PercentDiscountData = {
        ...discount,
        percent: 50,
      };
      const result = applyDiscount(halfDiscount, 4500);
      expect(result.updatedCents).toBe(2250);
      expect(result.discountAmountCents).toBe(2250);
    });

    it('rounds discount amount correctly', () => {
      // 33% of 100 = 33 cents
      const oddDiscount: PercentDiscountData = {
        ...discount,
        percent: 33,
      };
      const result = applyDiscount(oddDiscount, 100);
      expect(result.discountAmountCents).toBe(33);
      expect(result.updatedCents).toBe(67);
    });

    it('handles 1% discount', () => {
      const smallDiscount: PercentDiscountData = {
        ...discount,
        percent: 1,
      };
      const result = applyDiscount(smallDiscount, 4500);
      expect(result.discountAmountCents).toBe(45);
      expect(result.updatedCents).toBe(4455);
    });

    it('handles zero total', () => {
      const result = applyDiscount(discount, 0);
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(0);
    });
  });

  describe('amount discount', () => {
    const discount: AmountDiscountData = {
      ...baseFields,
      type: 'amount',
      amountCents: 500,
    };

    it('deducts $5 from $45', () => {
      const result = applyDiscount(discount, 4500);
      expect(result.updatedCents).toBe(4000);
      expect(result.discountAmountCents).toBe(500);
    });

    it('does not go below zero', () => {
      const result = applyDiscount(discount, 300);
      expect(result.updatedCents).toBe(0);
      // discountAmountCents should be capped at the total
      expect(result.discountAmountCents).toBe(300);
    });

    it('handles exact match (discount equals total)', () => {
      const result = applyDiscount(discount, 500);
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(500);
    });

    it('handles zero total', () => {
      const result = applyDiscount(discount, 0);
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(0);
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
      const result = applyDiscount(discount, 4500, now);
      expect(result.updatedCents).toBe(3500);
      expect(result.discountAmountCents).toBe(1000);
    });

    it('applies discount on the cutoff date itself', () => {
      const now = new Date('2025-06-01T00:00:00Z');
      const result = applyDiscount(discount, 4500, now);
      expect(result.updatedCents).toBe(3500);
      expect(result.discountAmountCents).toBe(1000);
    });

    it('does not apply after cutoff date', () => {
      const now = new Date('2025-06-02T00:00:00Z');
      const result = applyDiscount(discount, 4500, now);
      expect(result.updatedCents).toBe(4500);
      expect(result.discountAmountCents).toBe(0);
    });

    it('does not go below zero before cutoff', () => {
      const now = new Date('2025-05-01T00:00:00Z');
      const result = applyDiscount(discount, 500, now);
      expect(result.updatedCents).toBe(0);
      expect(result.discountAmountCents).toBe(500);
    });

    it('handles cutoff date as ISO string (Firestore deserialization)', () => {
      const discountWithStringDate = {
        ...discount,
        cutoffDate: '2025-06-01T00:00:00Z' as unknown as Date,
      };
      const now = new Date('2025-05-01T00:00:00Z');
      const result = applyDiscount(discountWithStringDate, 4500, now);
      expect(result.updatedCents).toBe(3500);
      expect(result.discountAmountCents).toBe(1000);
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
