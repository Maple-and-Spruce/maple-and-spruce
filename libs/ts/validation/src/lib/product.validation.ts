/**
 * Product validation suite
 *
 * Vest validation for product forms.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { CreateProductInput } from '@maple/ts/domain';

/**
 * Validate product form data
 *
 * @param data - Partial product data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * // Full validation
 * const result = productValidation(formData);
 * if (result.isValid()) {
 *   // Submit form
 * }
 */
export const productValidation = create(
  (data: Partial<CreateProductInput>, field?: string) => {
    only(field);

    test('artistId', 'Artist is required', () => {
      enforce(data.artistId).isNotBlank();
    });

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be at least 2 characters', () => {
      enforce(data.name).longerThanOrEquals(2);
    });

    test('price', 'Price is required', () => {
      enforce(data.price).isNotNullish();
    });

    test('price', 'Price must be greater than 0', () => {
      if (data.price !== undefined) {
        enforce(data.price).greaterThan(0);
      }
    });

    test('price', 'Price cannot exceed $100,000', () => {
      if (data.price !== undefined) {
        enforce(data.price).lessThanOrEquals(100000);
      }
    });

    test('sku', 'SKU must be alphanumeric if provided', () => {
      if (data.sku) {
        enforce(data.sku).matches(/^[A-Za-z0-9\-_]+$/);
      }
    });

    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be available, sold, or reserved', () => {
      if (data.status) {
        enforce(data.status).inside(['available', 'sold', 'reserved']);
      }
    });

    test('imageUrl', 'Image URL must be valid if provided', () => {
      if (data.imageUrl) {
        enforce(data.imageUrl).matches(/^https?:\/\/.+/);
      }
    });
  }
);
