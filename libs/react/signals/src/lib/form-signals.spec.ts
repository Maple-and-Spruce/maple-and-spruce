// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { signal } from '@preact/signals-react';
import {
  useFormSignals,
  createFieldHandler,
  createNumericHandler,
  createIntegerHandler,
} from './form-signals';

// --- Pure function tests (no hooks) ---

describe('createFieldHandler', () => {
  it('updates signal value from event target', () => {
    const s = signal('initial');
    const handler = createFieldHandler(s);

    handler({ target: { value: 'updated' } });

    expect(s.value).toBe('updated');
  });

  it('works with non-string types', () => {
    const s = signal(false);
    const handler = createFieldHandler(s);

    handler({ target: { value: true } });

    expect(s.value).toBe(true);
  });
});

describe('createNumericHandler', () => {
  it('parses float from string input', () => {
    const s = signal(0);
    const handler = createNumericHandler(s);

    handler({ target: { value: '12.5' } });

    expect(s.value).toBe(12.5);
  });

  it('uses fallback for NaN input', () => {
    const s = signal(99);
    const handler = createNumericHandler(s, 0);

    handler({ target: { value: 'not-a-number' } });

    expect(s.value).toBe(0);
  });

  it('uses default fallback of 0', () => {
    const s = signal(42);
    const handler = createNumericHandler(s);

    handler({ target: { value: '' } });

    expect(s.value).toBe(0);
  });

  it('handles negative numbers', () => {
    const s = signal(0);
    const handler = createNumericHandler(s);

    handler({ target: { value: '-3.14' } });

    expect(s.value).toBe(-3.14);
  });
});

describe('createIntegerHandler', () => {
  it('parses integer from string input', () => {
    const s = signal(0);
    const handler = createIntegerHandler(s);

    handler({ target: { value: '42' } });

    expect(s.value).toBe(42);
  });

  it('truncates decimal input to integer', () => {
    const s = signal(0);
    const handler = createIntegerHandler(s);

    handler({ target: { value: '12.9' } });

    expect(s.value).toBe(12);
  });

  it('uses fallback for NaN input', () => {
    const s = signal(10);
    const handler = createIntegerHandler(s, -1);

    handler({ target: { value: 'abc' } });

    expect(s.value).toBe(-1);
  });

  it('uses default fallback of 0', () => {
    const s = signal(5);
    const handler = createIntegerHandler(s);

    handler({ target: { value: '' } });

    expect(s.value).toBe(0);
  });
});

// --- Hook tests ---

describe('useFormSignals', () => {
  const initialValues = { name: '', price: 0, active: false };

  it('returns field signals with initial values', () => {
    const { result } = renderHook(() =>
      useFormSignals({ initialValues })
    );

    expect(result.current.field('name').value).toBe('');
    expect(result.current.field('price').value).toBe(0);
    expect(result.current.field('active').value).toBe(false);
  });

  it('provides computed values signal', () => {
    const { result } = renderHook(() =>
      useFormSignals({ initialValues })
    );

    expect(result.current.values.value).toEqual(initialValues);
  });

  it('tracks dirty state when field changes', () => {
    const { result } = renderHook(() =>
      useFormSignals({ initialValues })
    );

    expect(result.current.isDirty.value).toBe(false);

    act(() => {
      result.current.field('name').value = 'Test';
    });

    expect(result.current.isDirty.value).toBe(true);
  });

  it('resets fields to initial values', () => {
    const { result } = renderHook(() =>
      useFormSignals({ initialValues })
    );

    act(() => {
      result.current.field('name').value = 'Changed';
      result.current.field('price').value = 99;
    });

    expect(result.current.isDirty.value).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.field('name').value).toBe('');
    expect(result.current.field('price').value).toBe(0);
    expect(result.current.isDirty.value).toBe(false);
  });

  it('is valid when no validate function is provided', () => {
    const { result } = renderHook(() =>
      useFormSignals({ initialValues })
    );

    expect(result.current.isValid.value).toBe(true);
    expect(result.current.validation.value).toBeNull();
  });

  describe('with validation', () => {
    const mockValidation = {
      isValid: () => true,
      getErrors: () => ({}),
    };

    const mockInvalidValidation = {
      isValid: () => false,
      getErrors: () => ({ name: ['Name is required'] }),
    };

    it('runs validation and reports valid state', () => {
      const validate = vi.fn().mockReturnValue(mockValidation);

      const { result } = renderHook(() =>
        useFormSignals({ initialValues, validate })
      );

      expect(result.current.isValid.value).toBe(true);
    });

    it('runs validation and reports invalid state', () => {
      const validate = vi.fn().mockReturnValue(mockInvalidValidation);

      const { result } = renderHook(() =>
        useFormSignals({ initialValues, validate })
      );

      expect(result.current.isValid.value).toBe(false);
    });

    it('does not show errors until triggerValidation is called', () => {
      const validate = vi.fn().mockReturnValue(mockInvalidValidation);

      const { result } = renderHook(() =>
        useFormSignals({ initialValues, validate })
      );

      // Errors hidden by default
      expect(result.current.errors.value).toEqual({});

      // Trigger validation
      let isValid: boolean;
      act(() => {
        isValid = result.current.triggerValidation();
      });

      expect(isValid!).toBe(false);
      expect(result.current.errors.value).toEqual({
        name: ['Name is required'],
      });
    });

    it('getFieldError returns first error for a field', () => {
      const validate = vi.fn().mockReturnValue(mockInvalidValidation);

      const { result } = renderHook(() =>
        useFormSignals({ initialValues, validate })
      );

      act(() => {
        result.current.triggerValidation();
      });

      expect(result.current.getFieldError('name')).toBe('Name is required');
    });

    it('getFieldError returns null when no error exists', () => {
      const validate = vi.fn().mockReturnValue(mockInvalidValidation);

      const { result } = renderHook(() =>
        useFormSignals({ initialValues, validate })
      );

      act(() => {
        result.current.triggerValidation();
      });

      expect(result.current.getFieldError('price')).toBeNull();
    });

    it('triggerValidation returns true when valid', () => {
      const validate = vi.fn().mockReturnValue(mockValidation);

      const { result } = renderHook(() =>
        useFormSignals({ initialValues, validate })
      );

      let isValid: boolean;
      act(() => {
        isValid = result.current.triggerValidation();
      });

      expect(isValid!).toBe(true);
    });

    it('reset clears showValidationErrors flag', () => {
      const validate = vi.fn().mockReturnValue(mockInvalidValidation);

      const { result } = renderHook(() =>
        useFormSignals({ initialValues, validate })
      );

      act(() => {
        result.current.triggerValidation();
      });

      expect(result.current.errors.value).toEqual({
        name: ['Name is required'],
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.errors.value).toEqual({});
      expect(result.current.showValidationErrors.value).toBe(false);
    });
  });
});
