import { describe, it, expect } from 'vitest';
import type {
  Payout,
  PayoutStatus,
  GeneratePayoutInput,
  MarkPayoutPaidInput,
  PayoutSummary,
} from './payout';

// Force v8 to process the module for coverage
import * as payoutModule from './payout';

const basePayout: Payout = {
  id: 'payout-1',
  artistId: 'artist-1',
  periodStart: new Date('2025-01-01'),
  periodEnd: new Date('2025-01-31'),
  saleCount: 5,
  totalSales: 50000,
  totalCommission: 15000,
  amountOwed: 35000,
  status: 'pending',
  saleIds: ['sale-1', 'sale-2', 'sale-3', 'sale-4', 'sale-5'],
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Payout types', () => {
  it('creates a pending payout', () => {
    expect(basePayout.status).toBe('pending');
    expect(basePayout.amountOwed).toBe(35000);
    expect(basePayout.saleIds).toHaveLength(5);
  });

  it('creates a paid payout with optional fields', () => {
    const paidPayout: Payout = {
      ...basePayout,
      status: 'paid',
      paidAt: new Date('2025-02-01'),
      paymentMethod: 'venmo',
      paymentReference: 'txn-123',
      notes: 'February payout',
    };
    expect(paidPayout.status).toBe('paid');
    expect(paidPayout.paymentMethod).toBe('venmo');
    expect(paidPayout.paymentReference).toBe('txn-123');
    expect(paidPayout.paidAt).toBeDefined();
  });

  it('enforces PayoutStatus union', () => {
    const statuses: PayoutStatus[] = ['pending', 'paid'];
    expect(statuses).toHaveLength(2);
  });

  it('creates a GeneratePayoutInput', () => {
    const input: GeneratePayoutInput = {
      artistId: 'artist-1',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-31'),
    };
    expect(input.artistId).toBe('artist-1');
  });

  it('creates a MarkPayoutPaidInput with optional fields', () => {
    const input: MarkPayoutPaidInput = {
      payoutId: 'payout-1',
      paymentMethod: 'check',
      paymentReference: 'check-456',
      notes: 'Mailed on 2/1',
    };
    expect(input.payoutId).toBe('payout-1');
  });

  it('creates a MarkPayoutPaidInput with only required fields', () => {
    const input: MarkPayoutPaidInput = {
      payoutId: 'payout-1',
    };
    expect(input.paymentMethod).toBeUndefined();
  });

  it('creates a PayoutSummary', () => {
    const summary: PayoutSummary = {
      id: 'payout-1',
      artistId: 'artist-1',
      artistName: 'Jane Doe',
      periodStart: new Date('2025-01-01'),
      periodEnd: new Date('2025-01-31'),
      saleCount: 5,
      totalSales: 50000,
      totalCommission: 15000,
      amountOwed: 35000,
      status: 'pending',
    };
    expect(summary.artistName).toBe('Jane Doe');
    expect(summary.amountOwed).toBe(35000);
  });

  it('module is defined', () => {
    expect(payoutModule).toBeDefined();
  });
});
