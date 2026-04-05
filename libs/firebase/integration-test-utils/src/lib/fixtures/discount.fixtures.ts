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

/** Well-known doc IDs for test discounts */
export const DISCOUNT_IDS = {
  percent: 'test-discount-percent',
  amount: 'test-discount-amount',
  amountBeforeDate: 'test-discount-early-bird',
  expired: 'test-discount-expired',
  inactive: 'test-discount-inactive',
  large: 'test-discount-large',
} as const;
