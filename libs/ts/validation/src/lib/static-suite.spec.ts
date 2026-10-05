import { describe, it, expect } from 'vitest';
import { test, enforce, only } from 'vest';
import { staticSuite } from './static-suite';

const validate = staticSuite(
  (data: { classId?: string; email?: string }, field?: string | string[]) => {
    only(field);

    test('classId', 'Class is required', () => {
      enforce(data.classId).isNotBlank();
    });

    test('email', 'Email is required', () => {
      enforce(data.email).isNotBlank();
    });
  }
);

describe('staticSuite', () => {
  it('validates every field when no field is given', () => {
    const result = validate({});
    expect(result.hasErrors('classId')).toBe(true);
    expect(result.hasErrors('email')).toBe(true);
  });

  it('validates only the given fields', () => {
    const result = validate({ classId: 'class-1' }, 'classId');
    expect(result.hasErrors()).toBe(false);
  });

  // Vest 6's `runStatic` fails this: the focused run reports the email error
  // left over from the full run before it.
  it('does not carry errors from a previous call into a focused one', () => {
    expect(validate({ classId: 'class-1' }).hasErrors('email')).toBe(true);

    const focused = validate({ classId: 'class-1' }, 'classId');
    expect(focused.hasErrors('email')).toBe(false);
    expect(focused.hasErrors()).toBe(false);
  });

  it('does not carry a passing result into a later failing one', () => {
    expect(validate({ classId: 'class-1', email: 'a@example.com' }).hasErrors()).toBe(false);
    expect(validate({ classId: 'class-1' }).hasErrors('email')).toBe(true);
  });

  it('accepts a list of fields', () => {
    const result = validate({}, ['email']);
    expect(result.hasErrors('email')).toBe(true);
    expect(result.hasErrors('classId')).toBe(false);
  });
});
