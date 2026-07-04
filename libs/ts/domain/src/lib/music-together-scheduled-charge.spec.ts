import { describe, it, expect } from 'vitest';
import {
  mtChargeIdempotencyKey,
  mtChargeIsPending,
  mtHasFailedCharge,
  MT_TERMINAL_CHARGE_STATUSES,
  type MusicTogetherChargeStatus,
} from './music-together-scheduled-charge';

describe('mtHasFailedCharge', () => {
  it('is true when any charge failed', () => {
    expect(
      mtHasFailedCharge([{ status: 'paid' }, { status: 'failed' }])
    ).toBe(true);
  });
  it('is false when none failed', () => {
    expect(
      mtHasFailedCharge([{ status: 'paid' }, { status: 'scheduled' }])
    ).toBe(false);
    expect(mtHasFailedCharge([])).toBe(false);
  });
});

describe('mtChargeIdempotencyKey', () => {
  it('derives a stable key from the charge id (never time-based)', () => {
    expect(mtChargeIdempotencyKey('abc123')).toBe('mt-charge-abc123');
    // Stability: same id always yields the same key.
    expect(mtChargeIdempotencyKey('abc123')).toBe(
      mtChargeIdempotencyKey('abc123')
    );
  });
});

describe('mtChargeIsPending', () => {
  it('is true only for scheduled', () => {
    expect(mtChargeIsPending({ status: 'scheduled' })).toBe(true);
    for (const status of [
      'charging',
      'paid',
      'failed',
      'cancelled',
    ] as MusicTogetherChargeStatus[]) {
      expect(mtChargeIsPending({ status })).toBe(false);
    }
  });
});

describe('MT_TERMINAL_CHARGE_STATUSES', () => {
  it('lists the statuses the charge job must skip', () => {
    expect([...MT_TERMINAL_CHARGE_STATUSES]).toEqual([
      'paid',
      'failed',
      'cancelled',
    ]);
  });
});
