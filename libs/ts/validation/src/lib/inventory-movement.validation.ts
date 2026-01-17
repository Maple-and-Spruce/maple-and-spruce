/**
 * Inventory Movement validation suite
 *
 * Vest validation for inventory adjustments.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { CreateInventoryMovementInput } from '@maple/ts/domain';

const VALID_MOVEMENT_TYPES = [
  'sale',
  'return',
  'restock',
  'adjustment',
  'damaged',
  'initial',
] as const;

const VALID_SOURCES = ['manual', 'etsy', 'square', 'system'] as const;

/**
 * Validate inventory movement data
 *
 * @param data - Partial inventory movement data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * const result = inventoryMovementValidation(formData);
 * if (result.isValid()) {
 *   // Record movement
 * }
 */
export const inventoryMovementValidation = create(
  (data: Partial<CreateInventoryMovementInput>, field?: string) => {
    only(field);

    test('productId', 'Product is required', () => {
      enforce(data.productId).isNotBlank();
    });

    test('type', 'Movement type is required', () => {
      enforce(data.type).isNotBlank();
    });

    test('type', 'Movement type must be valid', () => {
      if (data.type) {
        enforce(data.type).inside(VALID_MOVEMENT_TYPES);
      }
    });

    test('quantityChange', 'Quantity change is required', () => {
      enforce(data.quantityChange).isNotNullish();
    });

    test('quantityChange', 'Quantity change must be a whole number', () => {
      if (data.quantityChange !== undefined) {
        enforce(data.quantityChange).condition((val) => Number.isInteger(val));
      }
    });

    test('quantityChange', 'Quantity change cannot be zero', () => {
      if (data.quantityChange !== undefined) {
        enforce(data.quantityChange).notEquals(0);
      }
    });

    test('quantityBefore', 'Quantity before is required', () => {
      enforce(data.quantityBefore).isNotNullish();
    });

    test('quantityBefore', 'Quantity before must be non-negative', () => {
      if (data.quantityBefore !== undefined) {
        enforce(data.quantityBefore).greaterThanOrEquals(0);
      }
    });

    test('quantityAfter', 'Quantity after is required', () => {
      enforce(data.quantityAfter).isNotNullish();
    });

    test('quantityAfter', 'Quantity after must be non-negative', () => {
      if (data.quantityAfter !== undefined) {
        enforce(data.quantityAfter).greaterThanOrEquals(0);
      }
    });

    test('source', 'Source is required', () => {
      enforce(data.source).isNotBlank();
    });

    test('source', 'Source must be valid', () => {
      if (data.source) {
        enforce(data.source).inside(VALID_SOURCES);
      }
    });

    // Cross-field validation: quantityAfter should equal quantityBefore + quantityChange
    test('quantityAfter', 'Quantity after must equal before + change', () => {
      if (
        data.quantityBefore !== undefined &&
        data.quantityChange !== undefined &&
        data.quantityAfter !== undefined
      ) {
        enforce(data.quantityAfter).equals(
          data.quantityBefore + data.quantityChange
        );
      }
    });

    // Sale movements should have a saleId
    test('saleId', 'Sale movements should have a sale ID', () => {
      if (data.type === 'sale' && !data.saleId) {
        enforce(data.saleId).isNotBlank();
      }
    });
  }
);
