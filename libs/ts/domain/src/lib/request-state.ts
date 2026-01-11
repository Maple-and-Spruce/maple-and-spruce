/**
 * Request state types for async operations
 *
 * Adapted from Mountain Sol's Requested<T> pattern.
 * Use discriminated unions instead of boolean flags for loading states.
 *
 * @see docs/SOL-PATTERNS-REFERENCE.md#async-state-pattern-requestedt
 */

/**
 * Represents the state of an async operation.
 * Use this instead of separate isLoading, isError, data variables.
 */
export type RequestState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: string };

/**
 * Type guards and utilities for RequestState
 */
export const RequestStateUtil = {
  idle: <T>(): RequestState<T> => ({ status: 'idle' }),
  loading: <T>(): RequestState<T> => ({ status: 'loading' }),
  success: <T>(data: T): RequestState<T> => ({ status: 'success', data }),
  error: <T>(error: string): RequestState<T> => ({ status: 'error', error }),

  isIdle: <T>(state: RequestState<T>): state is { status: 'idle' } =>
    state.status === 'idle',

  isLoading: <T>(state: RequestState<T>): state is { status: 'loading' } =>
    state.status === 'loading',

  isSuccess: <T>(state: RequestState<T>): state is { status: 'success'; data: T } =>
    state.status === 'success',

  isError: <T>(state: RequestState<T>): state is { status: 'error'; error: string } =>
    state.status === 'error',

  /** Get data if loaded, otherwise undefined */
  getData: <T>(state: RequestState<T>): T | undefined =>
    state.status === 'success' ? state.data : undefined,

  /** Map the data if loaded, otherwise return the state unchanged */
  map: <T, U>(state: RequestState<T>, fn: (data: T) => U): RequestState<U> => {
    if (state.status === 'success') {
      return { status: 'success', data: fn(state.data) };
    }
    return state as RequestState<U>;
  },
};

/**
 * Form submission state
 * Use for tracking form submit lifecycle
 */
export type FormState<T = void> =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

export const FormStateUtil = {
  idle: <T>(): FormState<T> => ({ status: 'idle' }),
  submitting: <T>(): FormState<T> => ({ status: 'submitting' }),
  success: <T>(data: T): FormState<T> => ({ status: 'success', data }),
  error: <T>(message: string): FormState<T> => ({ status: 'error', message }),

  isSubmitting: <T>(state: FormState<T>): boolean =>
    state.status === 'submitting',

  canSubmit: <T>(state: FormState<T>): boolean =>
    state.status === 'idle' || state.status === 'error',
};
