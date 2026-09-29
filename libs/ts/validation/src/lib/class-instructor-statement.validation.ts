/**
 * Class-instructor statement validation
 *
 * Vest suites for the class-instructor payout statement: generating one for
 * an instructor and month, and recording that David paid it.
 * @see https://vestjs.dev/
 */
import { staticSuite, test, enforce, only } from 'vest';
import type { ClassInstructorPaymentMethod } from '@maple/ts/domain';

export interface GenerateClassInstructorStatementInput {
  instructorId?: string;
  month?: string;
}

export interface MarkClassInstructorStatementPaidInput {
  id?: string;
  paidOn?: string;
  paymentMethod?: ClassInstructorPaymentMethod | string;
  paymentReference?: string;
}

const PAYMENT_METHODS: ClassInstructorPaymentMethod[] = ['payroll', 'bill-pay', 'other'];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const generateClassInstructorStatementValidation = staticSuite(
  (data: GenerateClassInstructorStatementInput, field?: string | string[]) => {
    only(field);

    test('instructorId', 'Instructor is required', () => {
      enforce(data.instructorId).isNotBlank();
    });

    test('month', 'Month must be YYYY-MM', () => {
      enforce(data.month).isString().matches(MONTH);
    });
  }
);

export const markClassInstructorStatementPaidValidation = staticSuite(
  (data: MarkClassInstructorStatementPaidInput, field?: string | string[]) => {
    only(field);

    test('id', 'Statement is required', () => {
      enforce(data.id).isNotBlank();
    });

    test('paidOn', 'Paid date is required', () => {
      enforce(data.paidOn).isNotBlank();
    });

    test('paidOn', 'Paid date must be a real date (YYYY-MM-DD)', () => {
      if (!data.paidOn) return;
      enforce(DAY.test(data.paidOn) && isRealDay(data.paidOn)).isTruthy();
    });

    test('paymentMethod', 'Choose how it was paid', () => {
      enforce(data.paymentMethod).inside(PAYMENT_METHODS);
    });

    test('paymentReference', 'Reference must be 200 characters or fewer', () => {
      if (data.paymentReference === undefined) return;
      enforce(data.paymentReference).isString().shorterThanOrEquals(200);
    });
  }
);
