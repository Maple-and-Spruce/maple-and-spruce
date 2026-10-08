import { describe, expect, it } from 'vitest';
import { formatCents } from './format-cents';

describe('formatCents', () => {
  it('formats whole and fractional dollars', () => {
    expect(formatCents(3000)).toBe('$30.00');
    expect(formatCents(3250)).toBe('$32.50');
    expect(formatCents(0)).toBe('$0.00');
  });
});
