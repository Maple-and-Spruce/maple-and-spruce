import type { Discount } from '@maple/ts/domain';

/**
 * All dates are static to prevent Chromatic snapshot changes.
 */

export const mockDiscountPercent: Discount = {
  id: 'discount-001',
  type: 'percent',
  code: 'SAVE10',
  description: '10% off your registration',
  status: 'active',
  percent: 10,
  createdAt: new Date('2024-06-01T10:00:00Z'),
  updatedAt: new Date('2024-06-01T10:00:00Z'),
};

export const mockDiscountAmount: Discount = {
  id: 'discount-002',
  type: 'amount',
  code: 'FIVER',
  description: '$5 off any class',
  status: 'active',
  amountCents: 500,
  createdAt: new Date('2024-06-15T10:00:00Z'),
  updatedAt: new Date('2024-06-15T10:00:00Z'),
};

export const mockDiscountEarlyBird: Discount = {
  id: 'discount-003',
  type: 'amount-before-date',
  code: 'EARLYBIRD',
  description: '$10 off if you register before the cutoff',
  status: 'active',
  amountCents: 1000,
  cutoffDate: new Date('2030-04-30T00:00:00Z'),
  createdAt: new Date('2024-07-01T10:00:00Z'),
  updatedAt: new Date('2024-07-01T10:00:00Z'),
};

export const mockDiscountInactive: Discount = {
  id: 'discount-004',
  type: 'percent',
  code: 'EXPIRED20',
  description: '20% off (no longer available)',
  status: 'inactive',
  percent: 20,
  createdAt: new Date('2024-03-01T10:00:00Z'),
  updatedAt: new Date('2024-05-01T10:00:00Z'),
};

export const mockDiscounts: Discount[] = [
  mockDiscountPercent,
  mockDiscountAmount,
  mockDiscountEarlyBird,
  mockDiscountInactive,
];
