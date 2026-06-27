import { describe, it, expect } from 'vitest';
import {
  isMtRegistrationConfirmed,
  mtRegistrationHasScheduledCharges,
  mtRefundCents,
  MT_CANCELLATION_FEE_CENTS,
  MT_CAPACITY_STATUSES,
} from './music-together-registration';

describe('isMtRegistrationConfirmed', () => {
  it('is true only for confirmed', () => {
    expect(isMtRegistrationConfirmed({ status: 'confirmed' })).toBe(true);
    expect(isMtRegistrationConfirmed({ status: 'pending' })).toBe(false);
    expect(isMtRegistrationConfirmed({ status: 'cancelled' })).toBe(false);
  });
});

describe('MT_CAPACITY_STATUSES', () => {
  it('counts pending and confirmed toward capacity', () => {
    expect([...MT_CAPACITY_STATUSES]).toEqual(['pending', 'confirmed']);
  });
});

describe('mtRefundCents', () => {
  const firstClass = new Date('2026-09-01T14:00:00Z');
  const fee = MT_CANCELLATION_FEE_CENTS;

  it('refunds amount paid minus the $25 fee before the first class', () => {
    const before = new Date('2026-08-25T14:00:00Z');
    expect(mtRefundCents(25200, firstClass, before)).toBe(25200 - fee); // full pay
    expect(mtRefundCents(13200, firstClass, before)).toBe(13200 - fee); // installment 1
  });

  it('is non-refundable on or after the first class', () => {
    expect(mtRefundCents(25200, firstClass, firstClass)).toBe(0); // exactly at start
    expect(
      mtRefundCents(25200, firstClass, new Date('2026-09-02T14:00:00Z'))
    ).toBe(0);
  });

  it('never goes negative when the paid amount is below the fee', () => {
    const before = new Date('2026-08-25T14:00:00Z');
    expect(mtRefundCents(1000, firstClass, before)).toBe(0);
  });

  it('treats a section with no first class as pre-class (refundable)', () => {
    expect(mtRefundCents(25200, undefined, new Date())).toBe(25200 - fee);
  });
});

describe('mtRegistrationHasScheduledCharges', () => {
  it('reflects the denormalized scheduled-charge count', () => {
    expect(mtRegistrationHasScheduledCharges({ scheduledChargeCount: 1 })).toBe(
      true
    );
    expect(mtRegistrationHasScheduledCharges({ scheduledChargeCount: 0 })).toBe(
      false
    );
    expect(
      mtRegistrationHasScheduledCharges({ scheduledChargeCount: undefined })
    ).toBe(false);
  });
});
