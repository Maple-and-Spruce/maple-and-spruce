import { describe, it, expect } from 'vitest';
import {
  isRegistrationConfirmed,
  canRefundRegistration,
  getNetAmountPaid,
  applySquareRefundToRegistration,
  hasOpenPartialRefund,
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

describe('applySquareRefundToRegistration', () => {
  const at = new Date('2026-10-15T15:00:00Z');

  it('a refund of the whole price makes it refunded', () => {
    const result = applySquareRefundToRegistration(baseRegistration, {
      refundId: 'rf-1',
      amountCents: 5300,
      at,
    });
    expect(result).toEqual({
      outcome: 'full',
      updates: {
        refundedAmountCents: 5300,
        squareRefundIds: ['rf-1'],
        lastRefundAt: at,
        status: 'refunded',
        refundedAt: at,
        squareRefundId: 'rf-1',
      },
    });
  });

  it('a refund of part of the price records the amount and leaves the status', () => {
    const result = applySquareRefundToRegistration(baseRegistration, {
      refundId: 'rf-1',
      amountCents: 2000,
      at,
    });
    expect(result).toEqual({
      outcome: 'partial',
      updates: {
        refundedAmountCents: 2000,
        squareRefundIds: ['rf-1'],
        lastRefundAt: at,
      },
    });
  });

  it('two partial refunds that add up to the price make it refunded', () => {
    const later = new Date('2026-10-16T15:00:00Z');
    const result = applySquareRefundToRegistration(
      {
        ...baseRegistration,
        refundedAmountCents: 2000,
        squareRefundIds: ['rf-1'],
      },
      { refundId: 'rf-2', amountCents: 3300, at: later }
    );
    expect(result).toEqual({
      outcome: 'full',
      updates: {
        refundedAmountCents: 5300,
        squareRefundIds: ['rf-1', 'rf-2'],
        lastRefundAt: later,
        status: 'refunded',
        refundedAt: later,
        squareRefundId: 'rf-2',
      },
    });
  });

  it('keeps an existing refundedAt and squareRefundId', () => {
    const first = new Date('2026-10-01T00:00:00Z');
    const result = applySquareRefundToRegistration(
      {
        ...baseRegistration,
        status: 'refunded',
        refundedAt: first,
        refundedAmountCents: 5000,
        squareRefundId: 'rf-app',
        squareRefundIds: ['rf-app'],
      },
      { refundId: 'rf-2', amountCents: 300, at }
    );
    expect(result.outcome).toBe('full');
    if (result.outcome === 'duplicate') throw new Error('unexpected');
    expect(result.updates.refundedAt).toBeUndefined();
    expect(result.updates.squareRefundId).toBeUndefined();
  });

  it('counts a refund it has already seen once', () => {
    expect(
      applySquareRefundToRegistration(
        { ...baseRegistration, refundedAmountCents: 2000, squareRefundIds: ['rf-1'] },
        { refundId: 'rf-1', amountCents: 2000, at }
      )
    ).toEqual({ outcome: 'duplicate' });
  });

  it('treats the echo of an in-app refund (legacy squareRefundId) as a duplicate', () => {
    expect(
      applySquareRefundToRegistration(
        {
          ...baseRegistration,
          status: 'refunded',
          refundedAmountCents: 5300,
          squareRefundId: 'rf-app',
        },
        { refundId: 'rf-app', amountCents: 5300, at }
      )
    ).toEqual({ outcome: 'duplicate' });
  });

  it('never subtracts for a negative amount', () => {
    const result = applySquareRefundToRegistration(
      { ...baseRegistration, refundedAmountCents: 1000, squareRefundIds: ['rf-1'] },
      { refundId: 'rf-2', amountCents: -500, at }
    );
    if (result.outcome === 'duplicate') throw new Error('unexpected');
    expect(result.updates.refundedAmountCents).toBe(1000);
  });
});

describe('hasOpenPartialRefund', () => {
  it('is true for an active registration with money refunded', () => {
    expect(hasOpenPartialRefund({ status: 'confirmed', refundedAmountCents: 2000 })).toBe(true);
    expect(hasOpenPartialRefund({ status: 'no-show', refundedAmountCents: 1 })).toBe(true);
  });

  it('is false with nothing refunded, or once refunded or cancelled', () => {
    expect(hasOpenPartialRefund({ status: 'confirmed' })).toBe(false);
    expect(hasOpenPartialRefund({ status: 'confirmed', refundedAmountCents: 0 })).toBe(false);
    expect(hasOpenPartialRefund({ status: 'refunded', refundedAmountCents: 5300 })).toBe(false);
    expect(hasOpenPartialRefund({ status: 'cancelled', refundedAmountCents: 2000 })).toBe(false);
  });
});
