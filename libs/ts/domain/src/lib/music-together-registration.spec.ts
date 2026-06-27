import { describe, it, expect } from 'vitest';
import {
  isMtRegistrationConfirmed,
  mtHasPendingInstallment,
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

describe('mtHasPendingInstallment', () => {
  it('is true only when the second installment is still scheduled', () => {
    expect(
      mtHasPendingInstallment({
        installment2: {
          status: 'scheduled',
          dueAt: new Date(),
          amountCents: 13200,
          idempotencyKey: 'mt-installment2-abc',
        },
      })
    ).toBe(true);
  });

  it('is false for terminal or absent installments', () => {
    expect(mtHasPendingInstallment({ installment2: undefined })).toBe(false);
    for (const status of ['charging', 'paid', 'failed', 'cancelled'] as const) {
      expect(
        mtHasPendingInstallment({
          installment2: {
            status,
            dueAt: new Date(),
            amountCents: 13200,
            idempotencyKey: 'k',
          },
        })
      ).toBe(false);
    }
  });
});
