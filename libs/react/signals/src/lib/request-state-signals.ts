/**
 * Request State Signals Utilities
 *
 * Helpers for working with RequestState<T> in signals context.
 *
 * @example
 * ```tsx
 * import { useRequestState } from '@maple/react/signals';
 *
 * function ProductList() {
 *   const { state, isLoading, data, error, setLoading, setSuccess, setError } =
 *     useRequestState<Product[]>();
 *
 *   useSignalEffect(() => {
 *     setLoading();
 *     fetchProducts()
 *       .then(products => setSuccess(products))
 *       .catch(err => setError(err.message));
 *   });
 *
 *   if (isLoading.value) return <Loading />;
 *   if (error.value) return <Error message={error.value} />;
 *   return <List items={data.value} />;
 * }
 * ```
 */

import { useSignal, useComputed } from '@preact/signals-react';
import type { Signal, ReadonlySignal } from '@preact/signals-react';
import type { RequestState } from '@maple/ts/domain';

/**
 * Return type for useRequestState hook
 */
export interface RequestStateSignals<T> {
  /** The raw RequestState signal */
  state: Signal<RequestState<T>>;

  /** Whether the state is loading */
  isLoading: ReadonlySignal<boolean>;

  /** Whether the state is in success state */
  isSuccess: ReadonlySignal<boolean>;

  /** Whether the state is in error state */
  isError: ReadonlySignal<boolean>;

  /** The data if in success state, undefined otherwise */
  data: ReadonlySignal<T | undefined>;

  /** The error message if in error state, null otherwise */
  error: ReadonlySignal<string | null>;

  /** Set state to loading */
  setLoading: () => void;

  /** Set state to success with data */
  setSuccess: (data: T) => void;

  /** Set state to error with message */
  setError: (error: string) => void;

  /** Reset to idle state */
  reset: () => void;
}

/**
 * Hook for managing RequestState with signals
 *
 * Provides both the raw state and convenient derived signals for common checks.
 */
export function useRequestState<T>(): RequestStateSignals<T> {
  const state = useSignal<RequestState<T>>({ status: 'idle' });

  const isLoading = useComputed(() => state.value.status === 'loading');
  const isSuccess = useComputed(() => state.value.status === 'success');
  const isError = useComputed(() => state.value.status === 'error');

  const data = useComputed(() =>
    state.value.status === 'success' ? state.value.data : undefined
  );

  const error = useComputed(() =>
    state.value.status === 'error' ? state.value.error : null
  );

  const setLoading = () => {
    state.value = { status: 'loading' };
  };

  const setSuccess = (newData: T) => {
    state.value = { status: 'success', data: newData };
  };

  const setError = (errorMessage: string) => {
    state.value = { status: 'error', error: errorMessage };
  };

  const reset = () => {
    state.value = { status: 'idle' };
  };

  return {
    state,
    isLoading,
    isSuccess,
    isError,
    data,
    error,
    setLoading,
    setSuccess,
    setError,
    reset,
  };
}

/**
 * Create derived signals from an existing RequestState signal
 *
 * Useful when you have a RequestState signal and want the convenience methods.
 */
export function deriveRequestStateSignals<T>(
  state: Signal<RequestState<T>>
): Omit<RequestStateSignals<T>, 'state'> {
  // Note: These need to be created fresh each time, so this is a factory function
  // meant to be called once at component initialization
  const isLoading = useComputed(() => state.value.status === 'loading');
  const isSuccess = useComputed(() => state.value.status === 'success');
  const isError = useComputed(() => state.value.status === 'error');

  const data = useComputed(() =>
    state.value.status === 'success' ? state.value.data : undefined
  );

  const error = useComputed(() =>
    state.value.status === 'error' ? state.value.error : null
  );

  const setLoading = () => {
    state.value = { status: 'loading' };
  };

  const setSuccess = (newData: T) => {
    state.value = { status: 'success', data: newData };
  };

  const setError = (errorMessage: string) => {
    state.value = { status: 'error', error: errorMessage };
  };

  const reset = () => {
    state.value = { status: 'idle' };
  };

  return {
    isLoading,
    isSuccess,
    isError,
    data,
    error,
    setLoading,
    setSuccess,
    setError,
    reset,
  };
}
