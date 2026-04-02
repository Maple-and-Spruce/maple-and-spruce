import { describe, it, expect } from 'vitest';
import { calculateSaleAmounts } from './sale';

describe('calculateSaleAmounts', () => {
  it('calculates commission and artist earnings', () => {
    const result = calculateSaleAmounts(100, 0.4);
    expect(result.commission).toBe(40);
    expect(result.artistEarnings).toBe(60);
  });

  it('handles zero commission rate', () => {
    const result = calculateSaleAmounts(100, 0);
    expect(result.commission).toBe(0);
    expect(result.artistEarnings).toBe(100);
  });

  it('rounds to two decimal places', () => {
    const result = calculateSaleAmounts(33.33, 0.3);
    expect(result.commission).toBe(10);
    expect(result.artistEarnings).toBe(23.33);
  });
});
