/**
 * Employee validation suite
 *
 * Validates the user-supplied fields when granting / updating an
 * employee record. The Firebase Auth UID (`id`) is required for
 * create — the document ID *is* the UID, so a missing id means there's
 * no user to grant the role to.
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { CreateEmployeeInput } from '@maple/ts/domain';

export type EmployeeValidationInput = Partial<
  CreateEmployeeInput & { status: 'active' | 'inactive' }
>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const employeeValidation = staticSuite(
  (data: EmployeeValidationInput, field?: string | string[]) => {
    only(field);

    test('id', 'Firebase Auth UID is required', () => {
      enforce(data.id).isNotBlank();
    });

    test('name', 'Name is required', () => {
      enforce(data.name).isNotBlank();
    });

    test('name', 'Name must be at least 2 characters', () => {
      if (data.name) enforce(data.name).longerThanOrEquals(2);
    });

    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });

    test('email', 'Email must be valid', () => {
      if (data.email) enforce(data.email).matches(EMAIL_RE);
    });

    test('hourlyRate', 'Hourly rate is required', () => {
      enforce(data.hourlyRate).isNotEmpty();
    });

    test('hourlyRate', 'Hourly rate must be greater than 0', () => {
      if (data.hourlyRate !== undefined && data.hourlyRate !== null) {
        enforce(data.hourlyRate).greaterThan(0);
      }
    });

    test('status', 'Status must be active or inactive', () => {
      if (data.status) {
        enforce(data.status).inside(['active', 'inactive']);
      }
    });
  }
);
