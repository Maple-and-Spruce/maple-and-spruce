// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { signal } from '@preact/signals-react';
import type { RequestState } from '@maple/ts/domain';
import { useRequestState, deriveRequestStateSignals } from './request-state-signals';

describe('useRequestState', () => {
  it('starts in idle state', () => {
    const { result } = renderHook(() => useRequestState<string>());

    expect(result.current.state.value).toEqual({ status: 'idle' });
    expect(result.current.isLoading.value).toBe(false);
    expect(result.current.isSuccess.value).toBe(false);
    expect(result.current.isError.value).toBe(false);
    expect(result.current.data.value).toBeUndefined();
    expect(result.current.error.value).toBeNull();
  });

  it('transitions to loading state', () => {
    const { result } = renderHook(() => useRequestState<string>());

    act(() => {
      result.current.setLoading();
    });

    expect(result.current.state.value).toEqual({ status: 'loading' });
    expect(result.current.isLoading.value).toBe(true);
    expect(result.current.isSuccess.value).toBe(false);
    expect(result.current.isError.value).toBe(false);
    expect(result.current.data.value).toBeUndefined();
    expect(result.current.error.value).toBeNull();
  });

  it('transitions from loading to success', () => {
    const { result } = renderHook(() => useRequestState<string>());

    act(() => {
      result.current.setLoading();
    });

    act(() => {
      result.current.setSuccess('hello');
    });

    expect(result.current.state.value).toEqual({ status: 'success', data: 'hello' });
    expect(result.current.isLoading.value).toBe(false);
    expect(result.current.isSuccess.value).toBe(true);
    expect(result.current.isError.value).toBe(false);
    expect(result.current.data.value).toBe('hello');
    expect(result.current.error.value).toBeNull();
  });

  it('transitions from loading to error', () => {
    const { result } = renderHook(() => useRequestState<string>());

    act(() => {
      result.current.setLoading();
    });

    act(() => {
      result.current.setError('Something went wrong');
    });

    expect(result.current.state.value).toEqual({ status: 'error', error: 'Something went wrong' });
    expect(result.current.isLoading.value).toBe(false);
    expect(result.current.isSuccess.value).toBe(false);
    expect(result.current.isError.value).toBe(true);
    expect(result.current.data.value).toBeUndefined();
    expect(result.current.error.value).toBe('Something went wrong');
  });

  it('resets back to idle from success', () => {
    const { result } = renderHook(() => useRequestState<string>());

    act(() => {
      result.current.setSuccess('data');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.value).toEqual({ status: 'idle' });
    expect(result.current.isLoading.value).toBe(false);
    expect(result.current.isSuccess.value).toBe(false);
    expect(result.current.data.value).toBeUndefined();
  });

  it('resets back to idle from error', () => {
    const { result } = renderHook(() => useRequestState<string>());

    act(() => {
      result.current.setError('fail');
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.value).toEqual({ status: 'idle' });
    expect(result.current.isError.value).toBe(false);
    expect(result.current.error.value).toBeNull();
  });

  it('works with complex data types', () => {
    const { result } = renderHook(() =>
      useRequestState<{ items: number[]; total: number }>()
    );

    const testData = { items: [1, 2, 3], total: 3 };

    act(() => {
      result.current.setSuccess(testData);
    });

    expect(result.current.data.value).toEqual(testData);
  });
});

describe('deriveRequestStateSignals', () => {
  it('derives signals from an existing state signal', () => {
    const stateSignal = signal<RequestState<string>>({ status: 'idle' });

    const { result } = renderHook(() => deriveRequestStateSignals(stateSignal));

    expect(result.current.isLoading.value).toBe(false);
    expect(result.current.isSuccess.value).toBe(false);
    expect(result.current.isError.value).toBe(false);
    expect(result.current.data.value).toBeUndefined();
    expect(result.current.error.value).toBeNull();
  });

  it('provides working mutation methods', () => {
    const stateSignal = signal<RequestState<string>>({ status: 'idle' });

    const { result } = renderHook(() => deriveRequestStateSignals(stateSignal));

    act(() => {
      result.current.setLoading();
    });

    expect(stateSignal.value).toEqual({ status: 'loading' });
    expect(result.current.isLoading.value).toBe(true);

    act(() => {
      result.current.setSuccess('done');
    });

    expect(stateSignal.value).toEqual({ status: 'success', data: 'done' });
    expect(result.current.isSuccess.value).toBe(true);
    expect(result.current.data.value).toBe('done');
  });

  it('setError updates derived signals', () => {
    const stateSignal = signal<RequestState<string>>({ status: 'idle' });

    const { result } = renderHook(() => deriveRequestStateSignals(stateSignal));

    act(() => {
      result.current.setError('oops');
    });

    expect(stateSignal.value).toEqual({ status: 'error', error: 'oops' });
    expect(result.current.isError.value).toBe(true);
    expect(result.current.error.value).toBe('oops');
  });

  it('reset returns to idle', () => {
    const stateSignal = signal<RequestState<string>>({ status: 'success', data: 'x' });

    const { result } = renderHook(() => deriveRequestStateSignals(stateSignal));

    act(() => {
      result.current.reset();
    });

    expect(stateSignal.value).toEqual({ status: 'idle' });
    expect(result.current.isSuccess.value).toBe(false);
  });

  it('reacts to external state changes', () => {
    const stateSignal = signal<RequestState<number>>({ status: 'idle' });

    const { result } = renderHook(() => deriveRequestStateSignals(stateSignal));

    // Mutate the signal externally (not through the derived methods)
    act(() => {
      stateSignal.value = { status: 'success', data: 42 };
    });

    expect(result.current.isSuccess.value).toBe(true);
    expect(result.current.data.value).toBe(42);
  });
});
