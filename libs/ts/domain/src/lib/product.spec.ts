import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSku,
  isCacheStale,
  getEffectiveCommissionRate,
  formatPrice,
  toCents,
  CACHE_STALE_THRESHOLD_MS,
} from './product';
import type { Product } from './product';

describe('generateSku', () => {
  it('returns a string starting with prd_', () => {
    const sku = generateSku();
    expect(sku).toMatch(/^prd_/);
  });

  it('returns a string of correct length (prd_ + 8 chars)', () => {
    const sku = generateSku();
    expect(sku.length).toBe(12); // 'prd_' (4) + 8 random chars
  });

  it('generates unique SKUs on successive calls', () => {
    const skus = new Set<string>();
    for (let i = 0; i < 100; i++) {
      skus.add(generateSku());
    }
    // All 100 should be unique
    expect(skus.size).toBe(100);
  });

  it('only contains alphanumeric characters after prefix', () => {
    const sku = generateSku();
    const randomPart = sku.slice(4); // Remove 'prd_'
    expect(randomPart).toMatch(/^[a-z0-9]+$/);
  });
});

describe('isCacheStale', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false when cache was just synced', () => {
    const now = new Date();
    vi.setSystemTime(now);

    const product: Pick<Product, 'squareCache'> = {
      squareCache: {
        name: 'Test',
        priceCents: 1000,
        quantity: 5,
        sku: 'prd_test123',
        syncedAt: now,
      },
    };

    expect(isCacheStale(product)).toBe(false);
  });

  it('returns false when cache is within threshold', () => {
    const now = new Date();
    vi.setSystemTime(now);

    // Cache synced 4 minutes ago (threshold is 5 minutes)
    const syncedAt = new Date(now.getTime() - 4 * 60 * 1000);

    const product: Pick<Product, 'squareCache'> = {
      squareCache: {
        name: 'Test',
        priceCents: 1000,
        quantity: 5,
        sku: 'prd_test123',
        syncedAt,
      },
    };

    expect(isCacheStale(product)).toBe(false);
  });

  it('returns true when cache exceeds threshold', () => {
    const now = new Date();
    vi.setSystemTime(now);

    // Cache synced 6 minutes ago (threshold is 5 minutes)
    const syncedAt = new Date(now.getTime() - 6 * 60 * 1000);

    const product: Pick<Product, 'squareCache'> = {
      squareCache: {
        name: 'Test',
        priceCents: 1000,
        quantity: 5,
        sku: 'prd_test123',
        syncedAt,
      },
    };

    expect(isCacheStale(product)).toBe(true);
  });

  it('returns true at exactly the threshold boundary', () => {
    const now = new Date();
    vi.setSystemTime(now);

    // Cache synced exactly at threshold + 1ms
    const syncedAt = new Date(now.getTime() - CACHE_STALE_THRESHOLD_MS - 1);

    const product: Pick<Product, 'squareCache'> = {
      squareCache: {
        name: 'Test',
        priceCents: 1000,
        quantity: 5,
        sku: 'prd_test123',
        syncedAt,
      },
    };

    expect(isCacheStale(product)).toBe(true);
  });
});

describe('getEffectiveCommissionRate', () => {
  it('returns custom rate when set', () => {
    const product = { customCommissionRate: 0.25 };
    const artistDefaultRate = 0.3;

    expect(getEffectiveCommissionRate(product, artistDefaultRate)).toBe(0.25);
  });

  it('returns artist default rate when custom rate is undefined', () => {
    const product = { customCommissionRate: undefined };
    const artistDefaultRate = 0.3;

    expect(getEffectiveCommissionRate(product, artistDefaultRate)).toBe(0.3);
  });

  it('returns custom rate of 0 when explicitly set to 0', () => {
    const product = { customCommissionRate: 0 };
    const artistDefaultRate = 0.3;

    expect(getEffectiveCommissionRate(product, artistDefaultRate)).toBe(0);
  });

  it('returns custom rate of 1 when explicitly set to 1', () => {
    const product = { customCommissionRate: 1 };
    const artistDefaultRate = 0.3;

    expect(getEffectiveCommissionRate(product, artistDefaultRate)).toBe(1);
  });
});

describe('formatPrice', () => {
  it('formats cents to dollars with 2 decimal places', () => {
    expect(formatPrice(2500)).toBe('$25.00');
  });

  it('handles 0 cents', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('handles single digit cents', () => {
    expect(formatPrice(5)).toBe('$0.05');
  });

  it('handles prices under $1', () => {
    expect(formatPrice(99)).toBe('$0.99');
  });

  it('handles large prices', () => {
    expect(formatPrice(10000000)).toBe('$100000.00');
  });

  it('formats prices with cents correctly', () => {
    expect(formatPrice(1234)).toBe('$12.34');
    expect(formatPrice(1)).toBe('$0.01');
    expect(formatPrice(10)).toBe('$0.10');
  });
});

describe('toCents', () => {
  it('converts whole dollars to cents', () => {
    expect(toCents(25)).toBe(2500);
  });

  it('converts dollars with cents', () => {
    expect(toCents(25.99)).toBe(2599);
  });

  it('handles 0 dollars', () => {
    expect(toCents(0)).toBe(0);
  });

  it('rounds fractional cents correctly', () => {
    // $12.345 should round to 1235 cents
    expect(toCents(12.345)).toBe(1235);
    // $12.344 should round to 1234 cents
    expect(toCents(12.344)).toBe(1234);
  });

  it('handles floating point precision issues', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS
    // toCents should handle this gracefully
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it('handles large dollar amounts', () => {
    expect(toCents(100000)).toBe(10000000);
  });
});

describe('CACHE_STALE_THRESHOLD_MS', () => {
  it('is set to 5 minutes', () => {
    expect(CACHE_STALE_THRESHOLD_MS).toBe(5 * 60 * 1000);
  });
});
