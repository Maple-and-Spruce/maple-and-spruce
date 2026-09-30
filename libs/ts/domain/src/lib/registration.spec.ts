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
  pricePaidCents: 5300,
  subtotalCents: 5000,
  taxAmountCents: 300,
  taxRatePercent: 6.0,
  status: 'confirmed',
  source: 'web',
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
  it('excludes sales tax', () => {
    expect(getNetAmountPaid(baseRegistration)).toBe(5000);
  });

  it('does not take a discount off a subtotal that already has it removed', () => {
    // $50 class, $10 code: subtotal is already $40, and $42.40 was charged.
    expect(
      getNetAmountPaid({
        ...baseRegistration,
        subtotalCents: 4000,
        taxAmountCents: 240,
        pricePaidCents: 4240,
        discountAmountCents: 1000,
      })
    ).toBe(4000);
  });
});
