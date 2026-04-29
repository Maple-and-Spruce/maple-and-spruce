/**
 * Discount fixtures for integration tests.
 *
 * These are written directly to Firestore via the emulator REST API.
 * Codes are stored uppercase (repository queries with .toUpperCase()).
 */

/** A future cutoff date, 60 days from now */
function futureCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return d.toISOString();
}

/** A past cutoff date, 7 days ago */
function pastCutoff(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
}

export const PERCENT_DISCOUNT = {
  code: 'SAVE10',
  description: '10% off any class',
  type: 'percent',
  percent: 10,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const AMOUNT_DISCOUNT = {
  code: 'TENOFF',
  description: '$10 off any class',
  type: 'amount',
  amountCents: 1000,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const AMOUNT_BEFORE_DATE_DISCOUNT = {
  code: 'EARLYBIRD',
  description: '$15 early bird discount',
  type: 'amount-before-date',
  amountCents: 1500,
  cutoffDate: futureCutoff(),
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const EXPIRED_EARLY_BIRD_DISCOUNT = {
  code: 'LATEBIRD',
  description: '$15 expired early bird',
  type: 'amount-before-date',
  amountCents: 1500,
  cutoffDate: pastCutoff(),
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const INACTIVE_DISCOUNT = {
  code: 'DISABLED',
  description: 'Inactive discount',
  type: 'percent',
  percent: 50,
  status: 'inactive',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** A large discount that exceeds the class price */
export const LARGE_AMOUNT_DISCOUNT = {
  code: 'BIGDEAL',
  description: '$500 off (exceeds class price)',
  type: 'amount',
  amountCents: 50000,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Quantity-tier: 50% off slots 2+ (e.g., "register a pair, second slot 50% off").
 * No discount for qty=1; one slot discounted at qty=2; two slots at qty=3, etc.
 */
export const PAIR_PERCENT_DISCOUNT = {
  code: 'PAIR50',
  description: 'Bring a friend — 50% off second slot',
  type: 'percent',
  percent: 50,
  appliesTo: 'nth-slot-onward',
  nthSlot: 2,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Quantity-tier: $10 off slots 3+ (group-of-3 promo).
 */
export const PAIR_AMOUNT_DISCOUNT = {
  code: 'TRIO10',
  description: '$10 off each slot from the third onward',
  type: 'amount',
  amountCents: 1000,
  appliesTo: 'nth-slot-onward',
  nthSlot: 3,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Quantity-tier: per-slot amount that *exceeds* the unit price.
 * Used to verify the per-slot cap (slot price floors at $0).
 */
export const PAIR_AMOUNT_OVERSIZED = {
  code: 'OVERSIZED-PAIR',
  description: '$500 off slots 2+ (oversized — caps per slot)',
  type: 'amount',
  amountCents: 50000,
  appliesTo: 'nth-slot-onward',
  nthSlot: 2,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Single-use code: usageLimit=1, fresh (usageCount=0). First redemption
 * should succeed; a second attempt — even concurrently — must fail.
 */
export const SINGLE_USE_DISCOUNT = {
  code: 'ONESHOT',
  description: '50% off — single-use referral',
  type: 'percent',
  percent: 50,
  appliesTo: 'order',
  nthSlot: 1,
  usageLimit: 1,
  usageCount: 0,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Already-exhausted code: usageLimit=1 with usageCount=1.
 * Should be silently ignored at compute time and never be applied.
 */
export const EXHAUSTED_DISCOUNT = {
  code: 'USED-UP',
  description: 'Single-use code that has already been redeemed',
  type: 'percent',
  percent: 50,
  appliesTo: 'order',
  nthSlot: 1,
  usageLimit: 1,
  usageCount: 1,
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/**
 * Code with a past expiresAt (distinct from amount-before-date's cutoffDate
 * which only ungates the early-bird type). Should be rejected by lookup.
 */
export const EXPIRED_BY_DATE_DISCOUNT = {
  code: 'TIMEOUT',
  description: 'Discount with a past global expiry',
  type: 'percent',
  percent: 50,
  appliesTo: 'order',
  nthSlot: 1,
  usageLimit: null,
  usageCount: 0,
  expiresAt: pastCutoff(),
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

/** Well-known doc IDs for test discounts */
export const DISCOUNT_IDS = {
  percent: 'test-discount-percent',
  amount: 'test-discount-amount',
  amountBeforeDate: 'test-discount-early-bird',
  expired: 'test-discount-expired',
  inactive: 'test-discount-inactive',
  large: 'test-discount-large',
  pairPercent: 'test-discount-pair-percent',
  pairAmount: 'test-discount-pair-amount',
  pairOversized: 'test-discount-pair-oversized',
  singleUse: 'test-discount-single-use',
  exhausted: 'test-discount-exhausted',
  expiredByDate: 'test-discount-expired-by-date',
} as const;
