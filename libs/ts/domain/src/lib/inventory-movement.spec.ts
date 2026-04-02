import { describe, it, expect } from 'vitest';
import {
  validateInventoryMovement,
  calculateQuantityFromMovements,
} from './inventory-movement';

describe('validateInventoryMovement', () => {
  it('returns valid for positive resulting quantity', () => {
    const result = validateInventoryMovement(10, -5);
    expect(result).toEqual({ valid: true, resultingQuantity: 5 });
  });

  it('returns valid for zero resulting quantity', () => {
    const result = validateInventoryMovement(5, -5);
    expect(result).toEqual({ valid: true, resultingQuantity: 0 });
  });

  it('returns invalid for negative resulting quantity', () => {
    const result = validateInventoryMovement(3, -5);
    expect(result.valid).toBe(false);
    expect(result.resultingQuantity).toBe(-2);
    expect(result.error).toBeDefined();
  });

  it('allows positive changes', () => {
    const result = validateInventoryMovement(5, 10);
    expect(result).toEqual({ valid: true, resultingQuantity: 15 });
  });
});

describe('calculateQuantityFromMovements', () => {
  it('sums all quantity changes', () => {
    const movements = [
      { quantityChange: 10 },
      { quantityChange: -3 },
      { quantityChange: 5 },
    ];
    expect(calculateQuantityFromMovements(movements)).toBe(12);
  });

  it('returns 0 for empty array', () => {
    expect(calculateQuantityFromMovements([])).toBe(0);
  });
});
