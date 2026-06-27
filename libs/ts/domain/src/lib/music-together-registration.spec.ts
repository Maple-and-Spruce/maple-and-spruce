import { describe, it, expect } from 'vitest';
import {
  isMtRegistrationConfirmed,
  mtRegistrationHasScheduledCharges,
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
