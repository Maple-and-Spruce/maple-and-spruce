/**
 * Registration validation suite
 *
 * Vest validation for customer registration forms.
 * Used on both the public checkout form and the server.
 *
 * @see https://vestjs.dev/
 */
import { test, enforce, only } from 'vest';
import { staticSuite } from './static-suite';

/**
 * Input shape for registration validation
 */
export interface RegistrationValidationInput {
  classId?: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  quantity?: number;
  notes?: string;
  additionalAttendees?: Array<{ name?: string; email?: string }>;
  /** Private-hours classes: start of the hour being booked (ISO or Date). */
  slotStart?: string | Date;
  /** Private-hours classes: roughly how many people are coming. */
  groupSize?: number;
}

/**
 * Validate registration form data
 *
 * @param data - Partial registration data to validate
 * @param field - Optional field to validate (for single-field validation)
 */
export const registrationValidation = staticSuite(
  (data: RegistrationValidationInput, field?: string | string[]) => {
    only(field);

    // Class ID validation
    test('classId', 'Class is required', () => {
      enforce(data.classId).isNotBlank();
    });

    // Customer name validation
    test('customerName', 'Name is required', () => {
      enforce(data.customerName).isNotBlank();
    });

    test('customerName', 'Name must be at least 2 characters', () => {
      enforce(data.customerName).longerThanOrEquals(2);
    });

    test('customerName', 'Name must be less than 100 characters', () => {
      enforce(data.customerName).shorterThan(100);
    });

    // Customer email validation
    test('customerEmail', 'Email is required', () => {
      enforce(data.customerEmail).isNotBlank();
    });

    test('customerEmail', 'Email must be a valid email address', () => {
      if (data.customerEmail) {
        enforce(data.customerEmail).matches(
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        );
      }
    });

    // Customer phone validation (optional)
    test('customerPhone', 'Phone number must be valid', () => {
      if (data.customerPhone) {
        // Accept digits, spaces, dashes, parens, plus sign, minimum 7 chars
        enforce(data.customerPhone).matches(
          /^[+]?[\d\s()-]{7,20}$/
        );
      }
    });

    // Quantity validation
    test('quantity', 'Quantity is required', () => {
      enforce(data.quantity).isNotNullish();
    });

    test('quantity', 'Quantity must be at least 1', () => {
      if (data.quantity !== undefined) {
        enforce(data.quantity).greaterThanOrEquals(1);
      }
    });

    test('quantity', 'Quantity cannot exceed 10', () => {
      if (data.quantity !== undefined) {
        enforce(data.quantity).lessThanOrEquals(10);
      }
    });

    // Private hours (optional here; the server checks the class needs them).
    test('slotStart', 'Pick a time', () => {
      if (data.slotStart !== undefined) {
        enforce(Number.isNaN(new Date(data.slotStart).getTime())).isFalsy();
      }
    });

    test('groupSize', 'Group size must be a whole number of at least 1', () => {
      if (data.groupSize !== undefined) {
        enforce(Number.isInteger(data.groupSize)).isTruthy();
        enforce(data.groupSize).greaterThanOrEquals(1);
      }
    });

    // Notes validation (optional)
    test('notes', 'Notes must be less than 500 characters', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(500);
      }
    });

    // Additional attendees validation (optional). Both name and email are
    // optional per attendee; we only validate format when something is provided.
    test('additionalAttendees', 'Each attendee name must be less than 100 characters', () => {
      if (data.additionalAttendees) {
        for (const attendee of data.additionalAttendees) {
          if (attendee.name) {
            enforce(attendee.name).shorterThan(100);
          }
        }
      }
    });

    test('additionalAttendees', 'Each attendee email must be a valid email address', () => {
      if (data.additionalAttendees) {
        for (const attendee of data.additionalAttendees) {
          if (attendee.email) {
            enforce(attendee.email).matches(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
          }
        }
      }
    });
  }
);
