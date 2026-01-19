import { describe, it, expect } from 'vitest';
import { inventoryMovementValidation } from './inventory-movement.validation';
import type { CreateInventoryMovementInput } from '@maple/ts/domain';

describe('inventoryMovementValidation', () => {
  const validMovement: CreateInventoryMovementInput = {
    productId: 'prod-123',
    type: 'restock',
    quantityChange: 10,
    quantityBefore: 5,
    quantityAfter: 15,
    source: 'manual',
  };

  describe('valid data', () => {
    it('passes with all required fields', () => {
      const result = inventoryMovementValidation(validMovement);
      expect(result.isValid()).toBe(true);
    });

    it('passes with all valid movement types', () => {
      const types: CreateInventoryMovementInput['type'][] = [
        'sale',
        'return',
        'restock',
        'adjustment',
        'damaged',
        'initial',
      ];
      types.forEach((type) => {
        const movement =
          type === 'sale'
            ? { ...validMovement, type, saleId: 'sale-123' }
            : { ...validMovement, type };
        const result = inventoryMovementValidation(movement);
        expect(result.hasErrors('type')).toBe(false);
      });
    });

    it('passes with all valid sources', () => {
      const sources: CreateInventoryMovementInput['source'][] = [
        'manual',
        'etsy',
        'square',
        'system',
      ];
      sources.forEach((source) => {
        const result = inventoryMovementValidation({ ...validMovement, source });
        expect(result.hasErrors('source')).toBe(false);
      });
    });
  });

  describe('productId field', () => {
    it('fails when productId is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        productId: '',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('productId')).toContain('Product is required');
    });
  });

  describe('type field', () => {
    it('fails when type is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        type: '' as 'restock',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('type')).toContain('Movement type is required');
    });

    it('fails when type is invalid', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        type: 'invalid' as 'restock',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('type')).toContain('Movement type must be valid');
    });
  });

  describe('quantityChange field', () => {
    it('fails when quantityChange is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityChange: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityChange')).toContain(
        'Quantity change is required'
      );
    });

    it('fails when quantityChange is 0', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityChange: 0,
        quantityAfter: validMovement.quantityBefore, // Adjust to match
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityChange')).toContain(
        'Quantity change cannot be zero'
      );
    });

    it('fails when quantityChange is not a whole number', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityChange: 2.5,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityChange')).toContain(
        'Quantity change must be a whole number'
      );
    });

    it('passes with negative quantityChange (for sales/reductions)', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        type: 'sale',
        saleId: 'sale-123',
        quantityChange: -2,
        quantityBefore: 10,
        quantityAfter: 8,
      });
      expect(result.hasErrors('quantityChange')).toBe(false);
    });

    it('passes with positive quantityChange (for restocks)', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityChange: 5,
        quantityBefore: 10,
        quantityAfter: 15,
      });
      expect(result.hasErrors('quantityChange')).toBe(false);
    });
  });

  describe('quantityBefore field', () => {
    it('fails when quantityBefore is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityBefore: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityBefore')).toContain(
        'Quantity before is required'
      );
    });

    it('fails when quantityBefore is negative', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityBefore: -1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityBefore')).toContain(
        'Quantity before must be non-negative'
      );
    });

    it('passes with 0 quantityBefore', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityBefore: 0,
        quantityChange: 10,
        quantityAfter: 10,
      });
      expect(result.hasErrors('quantityBefore')).toBe(false);
    });
  });

  describe('quantityAfter field', () => {
    it('fails when quantityAfter is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityAfter: undefined as unknown as number,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityAfter')).toContain(
        'Quantity after is required'
      );
    });

    it('fails when quantityAfter is negative', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityAfter: -1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityAfter')).toContain(
        'Quantity after must be non-negative'
      );
    });

    it('passes with 0 quantityAfter', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        type: 'sale',
        saleId: 'sale-123',
        quantityBefore: 5,
        quantityChange: -5,
        quantityAfter: 0,
      });
      expect(result.hasErrors('quantityAfter')).toBe(false);
    });
  });

  describe('source field', () => {
    it('fails when source is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        source: '' as 'manual',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('source')).toContain('Source is required');
    });

    it('fails when source is invalid', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        source: 'invalid' as 'manual',
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('source')).toContain('Source must be valid');
    });
  });

  describe('cross-field validation', () => {
    it('fails when quantityAfter does not equal before + change', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityBefore: 10,
        quantityChange: 5,
        quantityAfter: 20, // Should be 15
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('quantityAfter')).toContain(
        'Quantity after must equal before + change'
      );
    });

    it('passes when quantityAfter equals before + change', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        quantityBefore: 10,
        quantityChange: 5,
        quantityAfter: 15,
      });
      expect(result.hasErrors('quantityAfter')).toBe(false);
    });

    it('works correctly with negative changes', () => {
      const result = inventoryMovementValidation({
        type: 'sale',
        productId: 'prod-123',
        saleId: 'sale-123',
        quantityBefore: 10,
        quantityChange: -3,
        quantityAfter: 7,
        source: 'square',
      });
      expect(result.isValid()).toBe(true);
    });
  });

  describe('saleId validation', () => {
    it('fails when type is sale but saleId is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        type: 'sale',
        saleId: undefined,
        quantityChange: -1,
        quantityAfter: validMovement.quantityBefore - 1,
      });
      expect(result.isValid()).toBe(false);
      expect(result.getErrors('saleId')).toContain(
        'Sale movements should have a sale ID'
      );
    });

    it('passes when type is sale and saleId is provided', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        type: 'sale',
        saleId: 'sale-123',
        quantityChange: -1,
        quantityAfter: validMovement.quantityBefore - 1,
      });
      expect(result.hasErrors('saleId')).toBe(false);
    });

    it('passes when type is not sale and saleId is missing', () => {
      const result = inventoryMovementValidation({
        ...validMovement,
        type: 'restock',
        saleId: undefined,
      });
      expect(result.hasErrors('saleId')).toBe(false);
    });
  });

  describe('single-field validation', () => {
    it('only validates specified field', () => {
      const invalidData = {
        productId: '', // invalid
        type: '' as 'restock', // invalid
        quantityChange: 0, // invalid
        quantityBefore: -1, // invalid
        quantityAfter: -1, // invalid
        source: '' as 'manual', // invalid
      };

      const result = inventoryMovementValidation(invalidData, 'productId');
      expect(result.hasErrors('productId')).toBe(true);
      expect(result.hasErrors('type')).toBe(false);
      expect(result.hasErrors('quantityChange')).toBe(false);
    });
  });
});
