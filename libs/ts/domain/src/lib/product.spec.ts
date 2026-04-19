import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSku,
  generateVariantId,
  isCacheStale,
  getEffectiveCommissionRate,
  formatPrice,
  toCents,
  getTotalQuantity,
  findVariant,
  findVariantBySquareId,
  findVariantByEtsyProductId,
  isMultiVariant,
  resolveVariants,
  CACHE_STALE_THRESHOLD_MS,
} from './product';
import type { Product, ProductVariant } from './product';

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

describe('generateVariantId', () => {
  it('returns a string starting with var_', () => {
    const id = generateVariantId();
    expect(id).toMatch(/^var_/);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateVariantId());
    }
    expect(ids.size).toBe(100);
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

// --- Variant helpers ---

const makeVariant = (overrides?: Partial<ProductVariant>): ProductVariant => ({
  id: 'var_abc12345',
  label: 'Regular',
  sku: 'prd_test1234',
  priceCents: 2500,
  quantity: 5,
  ...overrides,
});

const makeProductWithVariants = (
  variants: ProductVariant[]
): Pick<Product, 'variants'> => ({ variants });

describe('getTotalQuantity', () => {
  it('returns quantity for single variant', () => {
    const product = makeProductWithVariants([makeVariant({ quantity: 10 })]);
    expect(getTotalQuantity(product)).toBe(10);
  });

  it('sums quantities across multiple variants', () => {
    const product = makeProductWithVariants([
      makeVariant({ id: 'v1', quantity: 3 }),
      makeVariant({ id: 'v2', quantity: 7 }),
      makeVariant({ id: 'v3', quantity: 2 }),
    ]);
    expect(getTotalQuantity(product)).toBe(12);
  });

  it('returns 0 when all variants are out of stock', () => {
    const product = makeProductWithVariants([
      makeVariant({ quantity: 0 }),
      makeVariant({ id: 'v2', quantity: 0 }),
    ]);
    expect(getTotalQuantity(product)).toBe(0);
  });
});

describe('findVariant', () => {
  it('finds variant by ID', () => {
    const target = makeVariant({ id: 'var_target', label: 'Large' });
    const product = makeProductWithVariants([
      makeVariant({ id: 'var_other' }),
      target,
    ]);
    expect(findVariant(product, 'var_target')).toEqual(target);
  });

  it('returns undefined for unknown ID', () => {
    const product = makeProductWithVariants([makeVariant()]);
    expect(findVariant(product, 'var_nonexistent')).toBeUndefined();
  });
});

describe('findVariantBySquareId', () => {
  it('finds variant by Square variation ID', () => {
    const target = makeVariant({
      id: 'v1',
      squareVariationId: 'SQ_VAR_123',
    });
    const product = makeProductWithVariants([
      makeVariant({ id: 'v0', squareVariationId: 'SQ_VAR_000' }),
      target,
    ]);
    expect(findVariantBySquareId(product, 'SQ_VAR_123')).toEqual(target);
  });

  it('returns undefined when no match', () => {
    const product = makeProductWithVariants([
      makeVariant({ squareVariationId: 'SQ_VAR_999' }),
    ]);
    expect(findVariantBySquareId(product, 'SQ_VAR_000')).toBeUndefined();
  });
});

describe('findVariantByEtsyProductId', () => {
  it('finds variant by Etsy product ID', () => {
    const target = makeVariant({ id: 'v1', etsyProductId: 42 });
    const product = makeProductWithVariants([
      makeVariant({ id: 'v0', etsyProductId: 99 }),
      target,
    ]);
    expect(findVariantByEtsyProductId(product, 42)).toEqual(target);
  });

  it('returns undefined when no match', () => {
    const product = makeProductWithVariants([makeVariant()]);
    expect(findVariantByEtsyProductId(product, 42)).toBeUndefined();
  });
});

describe('isMultiVariant', () => {
  it('returns false for single variant', () => {
    const product = makeProductWithVariants([makeVariant()]);
    expect(isMultiVariant(product)).toBe(false);
  });

  it('returns true for multiple variants', () => {
    const product = makeProductWithVariants([
      makeVariant({ id: 'v1' }),
      makeVariant({ id: 'v2' }),
    ]);
    expect(isMultiVariant(product)).toBe(true);
  });
});

describe('resolveVariants', () => {
  it('returns provided variants when present', () => {
    const variants = [
      { label: 'Small', priceCents: 1000, quantity: 3 },
      { label: 'Large', priceCents: 1500, quantity: 5 },
    ];
    const result = resolveVariants({ variants });
    expect(result).toEqual(variants);
  });

  it('creates single Regular variant from legacy fields', () => {
    const result = resolveVariants({ priceCents: 2500, quantity: 10 });
    expect(result).toEqual([
      { label: 'Regular', priceCents: 2500, quantity: 10 },
    ]);
  });

  it('defaults to 0 price and quantity when legacy fields missing', () => {
    const result = resolveVariants({});
    expect(result).toEqual([
      { label: 'Regular', priceCents: 0, quantity: 0 },
    ]);
  });

  it('prefers variants over legacy fields', () => {
    const result = resolveVariants({
      variants: [{ label: 'Custom', priceCents: 500, quantity: 1 }],
      priceCents: 9999,
      quantity: 99,
    });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('Custom');
    expect(result[0].priceCents).toBe(500);
  });

  it('falls back to legacy when variants is empty array', () => {
    const result = resolveVariants({
      variants: [],
      priceCents: 2500,
      quantity: 10,
    });
    expect(result).toEqual([
      { label: 'Regular', priceCents: 2500, quantity: 10 },
    ]);
  });
});
