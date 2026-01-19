/**
 * Category validation suite
 *
 * Vest validation for category forms.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { CreateCategoryInput } from '@maple/ts/domain';

/**
 * Validate category form data
 *
 * @param data - Partial category data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * // Full validation
 * const result = categoryValidation(formData);
 * if (result.isValid()) {
 *   // Submit form
 * }
 *
 * @example
 * // Single field validation (on blur)
 * const result = categoryValidation(formData, 'name');
 * const errors = result.getErrors('name');
 */
export const categoryValidation = create(
  (data: Partial<CreateCategoryInput>, field?: string) => {
    only(field);

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be at least 2 characters', () => {
      enforce(data.name).longerThanOrEquals(2);
    });

    test('name', 'Name must be at most 50 characters', () => {
      enforce(data.name).shorterThanOrEquals(50);
    });

    test('description', 'Description must be at most 200 characters', () => {
      if (data.description) {
        enforce(data.description).shorterThanOrEquals(200);
      }
    });

    test('order', 'Display order is required', () => {
      enforce(data.order).isNotNullish();
    });

    test('order', 'Display order must be a non-negative number', () => {
      if (data.order !== undefined) {
        enforce(data.order).greaterThanOrEquals(0);
      }
    });
  }
);
