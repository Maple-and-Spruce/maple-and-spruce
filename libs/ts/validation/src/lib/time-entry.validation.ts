/**
 * Time entry validation suite
 *
 * Validates a single time entry's user-supplied fields. Status / paid
 * fields are server-controlled and not validated here.
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { CreateTimeEntryInput } from '@maple/ts/domain';

export type TimeEntryValidationInput = Partial<
  Pick<CreateTimeEntryInput, 'employeeId' | 'date' | 'hours' | 'notes'>
>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const timeEntryValidation = staticSuite(
  (data: TimeEntryValidationInput, field?: string | string[]) => {
    only(field);

    test('employeeId', 'Employee is required', () => {
      enforce(data.employeeId).isNotBlank();
    });

    test('date', 'Date is required', () => {
      enforce(data.date).isNotBlank();
    });

    test('date', 'Date must be in YYYY-MM-DD format', () => {
      if (data.date) {
        enforce(data.date).matches(ISO_DATE);
      }
    });

    test('hours', 'Hours are required', () => {
      enforce(data.hours).isNotEmpty();
    });

    test('hours', 'Hours must be greater than 0', () => {
      if (data.hours !== undefined && data.hours !== null) {
        enforce(data.hours).greaterThan(0);
      }
    });

    test('hours', 'Hours cannot exceed 24', () => {
      if (data.hours !== undefined && data.hours !== null) {
        enforce(data.hours).lessThanOrEquals(24);
      }
    });

    test('notes', 'Notes must be 500 characters or fewer', () => {
      if (data.notes) {
        enforce(data.notes).shorterThanOrEquals(500);
      }
    });
  }
);
