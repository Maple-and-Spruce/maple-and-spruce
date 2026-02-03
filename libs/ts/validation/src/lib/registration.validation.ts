/**
 * Registration validation suite
 *
 * Vest validation for customer registration forms.
 * Used on both the public checkout form and the server.
 *
 * @see https://vestjs.dev/
 */
import { create, test, enforce, only } from 'vest';

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
}

/**
 * Validate registration form data
 *
 * @param data - Partial registration data to validate
 * @param field - Optional field to validate (for single-field validation)
 */
export const registrationValidation = create(
  (data: RegistrationValidationInput, field?: string) => {
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

    // Notes validation (optional)
    test('notes', 'Notes must be less than 500 characters', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(500);
      }
    });
  }
);
