import { describe, it, expect } from 'vitest';
import {
  isRegistrationConfirmed,
  canRefundRegistration,
  getNetAmountPaid,
} from './registration';
import type { Registration } from './registration';

const baseRegistration: Registration = {
  id: 'reg-1',
  classId: 'class-1',
  customerEmail: 'test@example.com',
  customerName: 'Test User',
  quantity: 1,
  pricePaidCents: 5000,
  status: 'confirmed',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('isRegistrationConfirmed', () => {
  it('returns true for confirmed registrations', () => {
    expect(isRegistrationConfirmed({ ...baseRegistration, status: 'confirmed' })).toBe(true);
  });

  it('returns false for non-confirmed registrations', () => {
    expect(isRegistrationConfirmed({ ...baseRegistration, status: 'pending' })).toBe(false);
    expect(isRegistrationConfirmed({ ...baseRegistration, status: 'cancelled' })).toBe(false);
  });
});

describe('canRefundRegistration', () => {
  it('returns true for confirmed and cancelled registrations', () => {
    expect(canRefundRegistration({ ...baseRegistration, status: 'confirmed' })).toBe(true);
    expect(canRefundRegistration({ ...baseRegistration, status: 'cancelled' })).toBe(true);
  });

  it('returns false for other statuses', () => {
    expect(canRefundRegistration({ ...baseRegistration, status: 'pending' })).toBe(false);
    expect(canRefundRegistration({ ...baseRegistration, status: 'refunded' })).toBe(false);
  });
});

describe('getNetAmountPaid', () => {
  it('returns full price when no discount', () => {
    expect(getNetAmountPaid(baseRegistration)).toBe(5000);
  });

  it('subtracts discount amount', () => {
    expect(getNetAmountPaid({ ...baseRegistration, discountAmountCents: 1000 })).toBe(4000);
  });
});
