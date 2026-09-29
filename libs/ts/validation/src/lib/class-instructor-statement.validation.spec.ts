import { describe, it, expect } from 'vitest';
import {
  generateClassInstructorStatementValidation,
  markClassInstructorStatementPaidValidation,
} from './class-instructor-statement.validation';

describe('generateClassInstructorStatementValidation', () => {
  it('passes with an instructor and a month', () => {
    expect(
      generateClassInstructorStatementValidation({ instructorId: 'i1', month: '2026-10' }).isValid()
    ).toBe(true);
  });

  it('requires an instructor', () => {
    const result = generateClassInstructorStatementValidation({ month: '2026-10' });
    expect(result.getErrors('instructorId')).toContain('Instructor is required');
  });

  it.each(['2026-13', '2026-1', 'October', '', undefined])('rejects month %s', (month) => {
    const result = generateClassInstructorStatementValidation({ instructorId: 'i1', month });
    expect(result.getErrors('month')).toContain('Month must be YYYY-MM');
  });
});

describe('markClassInstructorStatementPaidValidation', () => {
  const valid = { id: 's1', paidOn: '2026-11-05', paymentMethod: 'payroll' };

  it('passes a complete payment', () => {
    expect(markClassInstructorStatementPaidValidation(valid).isValid()).toBe(true);
    expect(
      markClassInstructorStatementPaidValidation({
        ...valid,
        paymentMethod: 'bill-pay',
        paymentReference: 'BP-1042',
      }).isValid()
    ).toBe(true);
  });

  it('requires the statement and the date', () => {
    const result = markClassInstructorStatementPaidValidation({ paymentMethod: 'other' });
    expect(result.getErrors('id')).toContain('Statement is required');
    expect(result.getErrors('paidOn')).toContain('Paid date is required');
  });

  it.each(['2026-02-30', '11/05/2026', '2026-11-5'])('rejects paid date %s', (paidOn) => {
    const result = markClassInstructorStatementPaidValidation({ ...valid, paidOn });
    expect(result.getErrors('paidOn')).toContain('Paid date must be a real date (YYYY-MM-DD)');
  });

  it('only accepts payroll, bill pay or other', () => {
    const result = markClassInstructorStatementPaidValidation({ ...valid, paymentMethod: 'venmo' });
    expect(result.getErrors('paymentMethod')).toContain('Choose how it was paid');
  });

  it('caps the reference length', () => {
    const result = markClassInstructorStatementPaidValidation({
      ...valid,
      paymentReference: 'x'.repeat(201),
    });
    expect(result.getErrors('paymentReference')).toHaveLength(1);
  });

  it('validates a single field', () => {
    const result = markClassInstructorStatementPaidValidation({ paymentMethod: 'venmo' }, 'paidOn');
    expect(result.getErrors('paymentMethod')).toEqual([]);
  });
});
