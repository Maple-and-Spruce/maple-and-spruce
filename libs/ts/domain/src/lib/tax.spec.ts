import { describe, it, expect } from 'vitest';
import { calculateTax } from './tax';

describe('calculateTax', () => {
  it('calculates 6% tax on a whole dollar amount', () => {
    const result = calculateTax(5000, 6.0); // $50.00
    expect(result.taxAmountCents).toBe(300); // $3.00
    expect(result.totalCents).toBe(5300); // $53.00
  });

  it('rounds tax to nearest cent', () => {
    // $33.33 * 6% = $1.9998 → rounds to $2.00
    const result = calculateTax(3333, 6.0);
    expect(result.taxAmountCents).toBe(200);
    expect(result.totalCents).toBe(3533);
  });

  it('rounds half-cent up', () => {
    // $8.25 * 6% = $0.495 → rounds to $0.50
    const result = calculateTax(825, 6.0);
    expect(result.taxAmountCents).toBe(50);
    expect(result.totalCents).toBe(875);
  });

  it('rounds half-cent down when below midpoint', () => {
    // $4.17 * 6% = $0.2502 → rounds to $0.25
    const result = calculateTax(417, 6.0);
    expect(result.taxAmountCents).toBe(25);
    expect(result.totalCents).toBe(442);
  });

  it('returns zero tax for zero subtotal', () => {
    const result = calculateTax(0, 6.0);
    expect(result.taxAmountCents).toBe(0);
    expect(result.totalCents).toBe(0);
  });

  it('returns zero tax for zero rate', () => {
    const result = calculateTax(5000, 0);
    expect(result.taxAmountCents).toBe(0);
    expect(result.totalCents).toBe(5000);
  });

  it('handles small amounts', () => {
    // $0.35 * 6% = $0.021 → rounds to $0.02
    const result = calculateTax(35, 6.0);
    expect(result.taxAmountCents).toBe(2);
    expect(result.totalCents).toBe(37);
  });

  it('handles typical class prices', () => {
    // $40 wire wrapping class
    expect(calculateTax(4000, 6.0)).toEqual({
      taxAmountCents: 240,
      totalCents: 4240,
    });

    // $60 stained glass class
    expect(calculateTax(6000, 6.0)).toEqual({
      taxAmountCents: 360,
      totalCents: 6360,
    });

    // $180 pottery series
    expect(calculateTax(18000, 6.0)).toEqual({
      taxAmountCents: 1080,
      totalCents: 19080,
    });

    // $35 music lesson
    expect(calculateTax(3500, 6.0)).toEqual({
      taxAmountCents: 210,
      totalCents: 3710,
    });
  });

  it('works with non-6% rates', () => {
    // Verify calculation works with arbitrary rate values
    const result = calculateTax(5000, 7.0);
    expect(result.taxAmountCents).toBe(350);
    expect(result.totalCents).toBe(5350);
  });
});
