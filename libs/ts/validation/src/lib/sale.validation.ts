/**
 * Sale validation suite
 *
 * Vest validation for sale recording forms.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { CreateSaleInput } from '@maple/ts/domain';

/**
 * Validate sale form data
 *
 * @param data - Partial sale data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * const result = saleValidation(formData);
 * if (result.isValid()) {
 *   // Record sale
 * }
 */
export const saleValidation = create(
  (data: Partial<CreateSaleInput>, field?: string) => {
    only(field);

    test('productId', 'Product is required', () => {
      enforce(data.productId).isNotBlank();
    });

    test('artistId', 'Artist is required', () => {
      enforce(data.artistId).isNotBlank();
    });

    test('salePrice', 'Sale price is required', () => {
      enforce(data.salePrice).isNotNullish();
    });

    test('salePrice', 'Sale price must be greater than 0', () => {
      if (data.salePrice !== undefined) {
        enforce(data.salePrice).greaterThan(0);
      }
    });

    test('commission', 'Commission is required', () => {
      enforce(data.commission).isNotNullish();
    });

    test('commission', 'Commission must be non-negative', () => {
      if (data.commission !== undefined) {
        enforce(data.commission).greaterThanOrEquals(0);
      }
    });

    test('artistEarnings', 'Artist earnings is required', () => {
      enforce(data.artistEarnings).isNotNullish();
    });

    test('artistEarnings', 'Artist earnings must be non-negative', () => {
      if (data.artistEarnings !== undefined) {
        enforce(data.artistEarnings).greaterThanOrEquals(0);
      }
    });

    test('source', 'Sale source is required', () => {
      enforce(data.source).isNotBlank();
    });

    test('source', 'Sale source must be etsy, in_store, or website', () => {
      if (data.source) {
        enforce(data.source).inside(['etsy', 'in_store', 'website']);
      }
    });

    test('soldAt', 'Sale date is required', () => {
      enforce(data.soldAt).isNotNullish();
    });

    // Cross-field validation: commission + earnings should equal sale price
    test('commission', 'Commission + earnings must equal sale price', () => {
      if (
        data.commission !== undefined &&
        data.artistEarnings !== undefined &&
        data.salePrice !== undefined
      ) {
        const total =
          Math.round((data.commission + data.artistEarnings) * 100) / 100;
        enforce(total).equals(data.salePrice);
      }
    });
  }
);
