/**
 * Artist validation suite
 *
 * Vest validation for artist forms.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { CreateArtistInput } from '@maple/ts/domain';

/**
 * Validate artist form data
 *
 * @param data - Partial artist data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * // Full validation
 * const result = artistValidation(formData);
 * if (result.isValid()) {
 *   // Submit form
 * }
 *
 * @example
 * // Single field validation (on blur)
 * const result = artistValidation(formData, 'email');
 * const errors = result.getErrors('email');
 */
export const artistValidation = create(
  (data: Partial<CreateArtistInput>, field?: string) => {
    only(field);

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be at least 2 characters', () => {
      enforce(data.name).longerThanOrEquals(2);
    });

    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });

    test('email', 'Email must be valid', () => {
      enforce(data.email).matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    test('phone', 'Phone must be valid if provided', () => {
      if (data.phone) {
        // Allow various phone formats
        enforce(data.phone).matches(/^[\d\s\-+()]+$/);
      }
    });

    test('defaultCommissionRate', 'Commission rate is required', () => {
      enforce(data.defaultCommissionRate).isNotNullish();
    });

    test('defaultCommissionRate', 'Commission rate must be between 0 and 1', () => {
      if (data.defaultCommissionRate !== undefined) {
        enforce(data.defaultCommissionRate).greaterThanOrEquals(0);
        enforce(data.defaultCommissionRate).lessThanOrEquals(1);
      }
    });

    test('status', 'Status is required', () => {
      enforce(data.status).isNotBlank();
    });

    test('status', 'Status must be active or inactive', () => {
      if (data.status) {
        enforce(data.status).inside(['active', 'inactive']);
      }
    });
  }
);
