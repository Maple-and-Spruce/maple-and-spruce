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
  appliesTo: 'order',
  nthSlot: 1,
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
  appliesTo: 'order',
  nthSlot: 1,
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
  appliesTo: 'order',
  nthSlot: 1,
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
  appliesTo: 'order',
  nthSlot: 1,
  percent: 20,
  createdAt: new Date('2024-03-01T10:00:00Z'),
  updatedAt: new Date('2024-05-01T10:00:00Z'),
};

export const mockDiscountPair: Discount = {
  id: 'discount-005',
  type: 'percent',
  code: 'PAIR50',
  description: 'Bring a friend — 50% off second slot',
  status: 'active',
  appliesTo: 'nth-slot-onward',
  nthSlot: 2,
  percent: 50,
  createdAt: new Date('2024-08-01T10:00:00Z'),
  updatedAt: new Date('2024-08-01T10:00:00Z'),
};

export const mockDiscounts: Discount[] = [
  mockDiscountPercent,
  mockDiscountAmount,
  mockDiscountEarlyBird,
  mockDiscountInactive,
  mockDiscountPair,
];
