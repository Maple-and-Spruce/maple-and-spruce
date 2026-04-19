/**
 * Product validation suite
 *
 * Vest validation for product forms.
 * Note: Products are linking records - Square is source of truth for catalog data.
 * This validation covers the input for creating/updating products.
 *
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { CreateProductInput } from '@maple/ts/domain';

/**
 * Validate product creation form data
 *
 * CreateProductInput contains:
 * - Firestore-owned: artistId, status, customCommissionRate
 * - Square-bound: name, description, priceCents, quantity
 *
 * @param data - Partial product data to validate
 * @param field - Optional field(s) to validate (for single-field or
 *                partial-update validation). Pass a string for a single
 *                field, or an array of field names to validate only those
 *                fields (useful for partial updates).
 *
 * @example
 * // Full validation
 * const result = productValidation(formData);
 * if (result.isValid()) {
 *   // Submit form
 * }
 *
 * @example
 * // Partial update - only validate fields that were provided
 * const result = productValidation(patch, Object.keys(patch));
 */
export const productValidation = staticSuite(
  (data: Partial<CreateProductInput>, field?: string | string[]) => {
    only(field);

    // === Firestore-owned fields ===

    test('artistId', 'Artist is required', () => {
      enforce(data.artistId).isNotBlank();
    });

    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be active, draft, or discontinued', () => {
      if (data.status) {
        enforce(data.status).inside(['active', 'draft', 'discontinued']);
      }
    });

    test('customCommissionRate', 'Commission rate must be between 0 and 1', () => {
      // Only validate if explicitly set (not undefined/null/NaN)
      if (
        data.customCommissionRate !== undefined &&
        data.customCommissionRate !== null &&
        !Number.isNaN(data.customCommissionRate)
      ) {
        enforce(data.customCommissionRate).greaterThanOrEquals(0);
        enforce(data.customCommissionRate).lessThanOrEquals(1);
      }
    });

    // === Square-bound fields (sent to Square API) ===

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be at least 2 characters', () => {
      enforce(data.name).longerThanOrEquals(2);
    });

    test('priceCents', 'Price is required', () => {
      enforce(data.priceCents).isNotNullish();
    });

    test('priceCents', 'Price must be greater than 0', () => {
      if (data.priceCents !== undefined) {
        enforce(data.priceCents).greaterThan(0);
      }
    });

    test('priceCents', 'Price cannot exceed $100,000', () => {
      if (data.priceCents !== undefined) {
        // 100000 dollars = 10000000 cents
        enforce(data.priceCents).lessThanOrEquals(10000000);
      }
    });

    test('quantity', 'Quantity is required', () => {
      enforce(data.quantity).isNotNullish();
    });

    test('quantity', 'Quantity must be 0 or greater', () => {
      if (data.quantity !== undefined) {
        enforce(data.quantity).greaterThanOrEquals(0);
      }
    });

    test('quantity', 'Quantity must be a whole number', () => {
      if (data.quantity !== undefined) {
        enforce(data.quantity).condition((val) => Number.isInteger(val));
      }
    });
  }
);
