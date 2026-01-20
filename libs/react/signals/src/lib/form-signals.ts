/**
 * Form Signals Utilities
 *
 * Helpers for building forms with signals and Vest validation.
 *
 * @example
 * ```tsx
 * import { useFormSignals } from '@maple/react/signals';
 * import { productValidation } from '@maple/ts/validation';
 *
 * function ProductForm() {
 *   const { field, validation, errors, isValid, showErrors } = useFormSignals({
 *     initialValues: { name: '', price: 0 },
 *     validate: (data) => productValidation(data),
 *   });
 *
 *   return (
 *     <TextField
 *       value={field('name').value}
 *       onChange={(e) => field('name').value = e.target.value}
 *       error={!!errors.value.name}
 *       helperText={errors.value.name?.[0]}
 *     />
 *   );
 * }
 * ```
 */

import { useSignal, useComputed, batch } from '@preact/signals-react';
import type { Signal, ReadonlySignal } from '@preact/signals-react';
import type { SuiteResult } from 'vest';

/**
 * Options for useFormSignals hook
 */
export interface FormSignalsOptions<T extends Record<string, unknown>> {
  /** Initial form values */
  initialValues: T;
  /** Vest validation suite function */
  validate?: (data: T) => SuiteResult<string, string>;
}

/**
 * Return type for useFormSignals hook
 */
export interface FormSignalsResult<T extends Record<string, unknown>> {
  /** Get signal for a form field */
  field: <K extends keyof T>(key: K) => Signal<T[K]>;
  /** All form values as a computed signal */
  values: ReadonlySignal<T>;
  /** Vest validation result (if validate provided) */
  validation: ReadonlySignal<SuiteResult<string, string> | null>;
  /** Validation errors (only shown after showErrors is true) */
  errors: ReadonlySignal<Record<string, string[]>>;
  /** Get first error for a field */
  getFieldError: (field: string) => string | null;
  /** Whether form passes validation */
  isValid: ReadonlySignal<boolean>;
  /** Signal to control when errors are displayed */
  showValidationErrors: Signal<boolean>;
  /** Show errors and return whether form is valid */
  triggerValidation: () => boolean;
  /** Reset form to initial values */
  reset: () => void;
  /** Check if any field has changed from initial values */
  isDirty: ReadonlySignal<boolean>;
}

/**
 * Hook for managing form state with signals and Vest validation
 *
 * Creates a signal for each form field with automatic validation tracking.
 */
export function useFormSignals<T extends Record<string, unknown>>(
  options: FormSignalsOptions<T>
): FormSignalsResult<T> {
  const { initialValues, validate } = options;

  // Create a signal for each field
  const fields = Object.fromEntries(
    Object.entries(initialValues).map(([key, value]) => [
      key,
      // eslint-disable-next-line react-hooks/rules-of-hooks
      useSignal(value),
    ])
  ) as { [K in keyof T]: Signal<T[K]> };

  // Computed: all current values
  const values = useComputed(() => {
    const result = {} as T;
    for (const key in fields) {
      result[key] = fields[key].value;
    }
    return result;
  });

  // Control when errors are displayed
  const showValidationErrors = useSignal(false);

  // Computed: validation result
  const validation = useComputed(() => {
    if (!validate) return null;
    return validate(values.value);
  });

  // Computed: errors (respects showValidationErrors flag)
  const errors = useComputed<Record<string, string[]>>(() => {
    if (!showValidationErrors.value || !validation.value) {
      return {};
    }
    return validation.value.getErrors();
  });

  // Computed: is form valid
  const isValid = useComputed(() => {
    if (!validation.value) return true;
    return validation.value.isValid();
  });

  // Computed: has any field changed
  const isDirty = useComputed(() => {
    for (const key in fields) {
      if (fields[key].value !== initialValues[key]) {
        return true;
      }
    }
    return false;
  });

  // Get signal for a specific field
  const field = <K extends keyof T>(key: K): Signal<T[K]> => {
    return fields[key];
  };

  // Get first error for a field
  const getFieldError = (fieldName: string): string | null => {
    const fieldErrors = errors.value[fieldName];
    return fieldErrors?.[0] ?? null;
  };

  // Trigger validation display and return validity
  const triggerValidation = (): boolean => {
    showValidationErrors.value = true;
    return isValid.value;
  };

  // Reset to initial values
  const reset = () => {
    batch(() => {
      for (const key in fields) {
        fields[key].value = initialValues[key];
      }
      showValidationErrors.value = false;
    });
  };

  return {
    field,
    values,
    validation,
    errors,
    getFieldError,
    isValid,
    showValidationErrors,
    triggerValidation,
    reset,
    isDirty,
  };
}

/**
 * Type-safe field change handler factory
 *
 * @example
 * ```tsx
 * const handleChange = createFieldHandler(nameSignal);
 * <input onChange={handleChange} />
 * ```
 */
export function createFieldHandler<T>(
  signal: Signal<T>
): (event: { target: { value: T } }) => void {
  return (event) => {
    signal.value = event.target.value;
  };
}

/**
 * Create a numeric field handler that parses input values
 *
 * @example
 * ```tsx
 * const handlePriceChange = createNumericHandler(priceSignal, 0);
 * <input type="number" onChange={handlePriceChange} />
 * ```
 */
export function createNumericHandler(
  signal: Signal<number>,
  fallback = 0
): (event: { target: { value: string } }) => void {
  return (event) => {
    const parsed = parseFloat(event.target.value);
    signal.value = Number.isNaN(parsed) ? fallback : parsed;
  };
}

/**
 * Create an integer field handler
 */
export function createIntegerHandler(
  signal: Signal<number>,
  fallback = 0
): (event: { target: { value: string } }) => void {
  return (event) => {
    const parsed = parseInt(event.target.value, 10);
    signal.value = Number.isNaN(parsed) ? fallback : parsed;
  };
}
