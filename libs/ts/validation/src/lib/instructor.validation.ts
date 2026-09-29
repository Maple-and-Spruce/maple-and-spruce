/**
 * Instructor validation suite
 *
 * Vest validation for instructor forms.
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import {
  INSTRUCTOR_PAYMENT_SETUP_METHODS,
  type CreateInstructorInput,
} from '@maple/ts/domain';

/** A real `YYYY-MM-DD` calendar date (rejects `2026-02-30`). */
function isCalendarDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

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
export const instructorValidation = staticSuite(
  (data: Partial<CreateInstructorInput>, field?: string | string[]) => {
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

    // Pay rate and type are coupled - validate together
    test('payRateType', 'Pay rate type must be valid if provided', () => {
      if (data.payRateType) {
        enforce(data.payRateType).inside(['flat', 'hourly', 'percentage']);
      }
    });

    // Only validate payRate if payRateType is set
    test('payRate', 'Pay rate is required when pay rate type is set', () => {
      if (data.payRateType && (data.payRate === undefined || data.payRate === null)) {
        enforce(false).isTruthy();
      }
    });

    test('payRate', 'Pay rate must be non-negative', () => {
      // Only validate if payRateType is set and payRate has a value
      if (data.payRateType && data.payRate !== undefined && data.payRate !== null) {
        enforce(data.payRate).greaterThanOrEquals(0);
      }
    });

    test('payRate', 'Percentage pay rate must be between 0 and 1', () => {
      if (data.payRateType === 'percentage' && data.payRate !== undefined && data.payRate !== null) {
        enforce(data.payRate).greaterThanOrEquals(0);
        enforce(data.payRate).lessThanOrEquals(1);
      }
    });

    // Contractor readiness (admin-only). Each item, once present, needs a real
    // calendar date; nothing here is required, because "not done yet" is a
    // valid state that the UI warns about rather than blocks.
    const readiness = data.readiness;

    test('agreementSignedOn', 'Date signed must be a valid date', () => {
      if (readiness?.contractorAgreement) {
        enforce(isCalendarDate(readiness.contractorAgreement.signedOn)).isTruthy();
      }
    });

    test('agreementReference', 'Reference must be 500 characters or fewer', () => {
      const reference = readiness?.contractorAgreement?.reference;
      if (reference) {
        enforce(reference).shorterThanOrEquals(500);
      }
    });

    test('backgroundCheckClearedOn', 'Date cleared must be a valid date', () => {
      if (readiness?.backgroundCheck) {
        enforce(isCalendarDate(readiness.backgroundCheck.clearedOn)).isTruthy();
      }
    });

    test('paymentSetupCompletedOn', 'Date completed must be a valid date', () => {
      if (readiness?.paymentSetup) {
        enforce(isCalendarDate(readiness.paymentSetup.completedOn)).isTruthy();
      }
    });

    test('paymentSetupMethod', 'Choose how this instructor is paid', () => {
      if (readiness?.paymentSetup) {
        enforce(readiness.paymentSetup.method).inside([
          ...INSTRUCTOR_PAYMENT_SETUP_METHODS,
        ]);
      }
    });
  }
);
