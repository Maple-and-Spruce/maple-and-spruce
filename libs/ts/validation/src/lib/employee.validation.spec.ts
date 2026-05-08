import { describe, it, expect } from 'vitest';
import { employeeValidation } from './employee.validation';

describe('employeeValidation', () => {
  const valid = {
    id: 'uid-abc',
    name: 'Nathan',
    email: 'nathan@example.com',
    hourlyRate: 18.5,
    status: 'active' as const,
  };

  it('accepts a fully valid employee', () => {
    const result = employeeValidation(valid);
    expect(result.hasErrors()).toBe(false);
  });

  it('rejects when id is blank', () => {
    const result = employeeValidation({ ...valid, id: '' });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects a short name', () => {
    const result = employeeValidation({ ...valid, name: 'A' });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = employeeValidation({ ...valid, email: 'not-an-email' });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects zero hourly rate', () => {
    const result = employeeValidation({ ...valid, hourlyRate: 0 });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects negative hourly rate', () => {
    const result = employeeValidation({ ...valid, hourlyRate: -1 });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects unknown status', () => {
    const result = employeeValidation({
      ...valid,
      status: 'pending' as unknown as 'active',
    });
    expect(result.hasErrors()).toBe(true);
  });

  it('supports partial validation', () => {
    const result = employeeValidation({ hourlyRate: 25 }, ['hourlyRate']);
    expect(result.hasErrors()).toBe(false);
  });
});
