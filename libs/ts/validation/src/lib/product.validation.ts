/**
 * Product validation suite
 *
 * Vest validation for product forms.
 * Note: Products are linking records - Square is source of truth for catalog data.
 * This validation is for the Firestore product record.
 *
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

    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be active, draft, or discontinued', () => {
      if (data.status) {
        enforce(data.status).inside(['active', 'draft', 'discontinued']);
      }
    });

    test('customCommissionRate', 'Commission rate must be between 0 and 1', () => {
      if (data.customCommissionRate !== undefined) {
        enforce(data.customCommissionRate).greaterThanOrEquals(0);
        enforce(data.customCommissionRate).lessThanOrEquals(1);
      }
    });

    test('imageUrl', 'Image URL must be valid if provided', () => {
      if (data.imageUrl) {
        enforce(data.imageUrl).matches(/^https?:\/\/.+/);
      }
    });

    // Square IDs are optional on creation (populated after sync)
    test('squareItemId', 'Square Item ID must not be empty if provided', () => {
      if (data.squareItemId !== undefined) {
        enforce(data.squareItemId).isNotBlank();
      }
    });

    test('squareVariationId', 'Square Variation ID must not be empty if provided', () => {
      if (data.squareVariationId !== undefined) {
        enforce(data.squareVariationId).isNotBlank();
      }
    });

    test('etsyListingId', 'Etsy Listing ID must not be empty if provided', () => {
      if (data.etsyListingId !== undefined) {
        enforce(data.etsyListingId).isNotBlank();
      }
    });
  }
);
