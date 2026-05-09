import { describe, it, expect } from 'vitest';
import { timeEntryValidation } from './time-entry.validation';

describe('timeEntryValidation', () => {
  const valid = {
    employeeId: 'uid-1',
    date: '2026-05-08',
    hours: 4,
    notes: 'opening shift',
  };

  it('accepts a fully valid entry', () => {
    const result = timeEntryValidation(valid);
    expect(result.hasErrors()).toBe(false);
    expect(result.isValid()).toBe(true);
  });

  it('rejects when employeeId is blank', () => {
    const result = timeEntryValidation({ ...valid, employeeId: '' });
    expect(result.hasErrors()).toBe(true);
    expect(result.getErrors()['employeeId']?.length).toBeGreaterThan(0);
  });

  it('rejects when date is missing', () => {
    const result = timeEntryValidation({ ...valid, date: '' });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects non-ISO date format', () => {
    const result = timeEntryValidation({ ...valid, date: '5/8/2026' });
    expect(result.hasErrors()).toBe(true);
    expect(result.getErrors()['date']?.[0]).toMatch(/YYYY-MM-DD/);
  });

  it('rejects zero hours', () => {
    const result = timeEntryValidation({ ...valid, hours: 0 });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects negative hours', () => {
    const result = timeEntryValidation({ ...valid, hours: -1 });
    expect(result.hasErrors()).toBe(true);
  });

  it('rejects more than 24 hours', () => {
    const result = timeEntryValidation({ ...valid, hours: 25 });
    expect(result.hasErrors()).toBe(true);
  });

  it('accepts exactly 24 hours', () => {
    const result = timeEntryValidation({ ...valid, hours: 24 });
    expect(result.hasErrors()).toBe(false);
  });

  it('rejects notes longer than 500 characters', () => {
    const result = timeEntryValidation({ ...valid, notes: 'x'.repeat(501) });
    expect(result.hasErrors()).toBe(true);
  });

  it('accepts no notes', () => {
    const result = timeEntryValidation({
      employeeId: 'uid-1',
      date: '2026-05-08',
      hours: 2,
    });
    expect(result.hasErrors()).toBe(false);
  });

  it('supports partial validation via field scope', () => {
    const result = timeEntryValidation({ hours: -2 }, ['hours']);
    expect(result.hasErrors()).toBe(true);
    // Other fields shouldn't be validated when scoped
    expect(result.getErrors()['employeeId']).toBeUndefined();
  });
});
