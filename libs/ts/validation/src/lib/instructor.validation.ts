/**
 * Instructor validation suite
 *
 * Vest validation for instructor forms.
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';
import type { CreateInstructorInput } from '@maple/ts/domain';

/**
 * Validate instructor form data
 *
 * @param data - Partial instructor data to validate
 * @param field - Optional field to validate (for single-field validation)
 *
 * @example
 * // Full validation
 * const result = instructorValidation(formData);
 * if (result.isValid()) {
 *   // Submit form
 * }
 */
export const instructorValidation = create(
  (data: Partial<CreateInstructorInput>, field?: string) => {
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
        enforce(data.phone).matches(/^[\d\s\-+()]+$/);
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

    test('bio', 'Bio must be less than 2000 characters', () => {
      if (data.bio) {
        enforce(data.bio).shorterThanOrEquals(2000);
      }
    });

    test('specialties', 'Each specialty must be at least 2 characters', () => {
      if (data.specialties && data.specialties.length > 0) {
        data.specialties.forEach((specialty) => {
          enforce(specialty).longerThanOrEquals(2);
        });
      }
    });

    test('payRate', 'Pay rate must be non-negative', () => {
      if (data.payRate !== undefined) {
        enforce(data.payRate).greaterThanOrEquals(0);
      }
    });

    test('payRateType', 'Pay rate type must be valid if provided', () => {
      if (data.payRateType) {
        enforce(data.payRateType).inside(['flat', 'hourly', 'percentage']);
      }
    });

    test('payRate', 'Percentage pay rate must be between 0 and 1', () => {
      if (data.payRateType === 'percentage' && data.payRate !== undefined) {
        enforce(data.payRate).greaterThanOrEquals(0);
        enforce(data.payRate).lessThanOrEquals(1);
      }
    });
  }
);
