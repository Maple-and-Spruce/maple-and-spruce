import { describe, it, expect } from 'vitest';
import { RequestStateUtil, FormStateUtil } from './request-state';

describe('RequestStateUtil', () => {
  it('idle() creates idle state', () => {
    const state = RequestStateUtil.idle<string>();
    expect(state).toEqual({ status: 'idle' });
  });

  it('loading() creates loading state', () => {
    const state = RequestStateUtil.loading<string>();
    expect(state).toEqual({ status: 'loading' });
  });

  it('success() creates success state with data', () => {
    const state = RequestStateUtil.success('hello');
    expect(state).toEqual({ status: 'success', data: 'hello' });
  });

  it('error() creates error state with message', () => {
    const state = RequestStateUtil.error<string>('fail');
    expect(state).toEqual({ status: 'error', error: 'fail' });
  });

  it('isIdle() returns true for idle state', () => {
    expect(RequestStateUtil.isIdle(RequestStateUtil.idle())).toBe(true);
    expect(RequestStateUtil.isIdle(RequestStateUtil.loading())).toBe(false);
  });

  it('isLoading() returns true for loading state', () => {
    expect(RequestStateUtil.isLoading(RequestStateUtil.loading())).toBe(true);
    expect(RequestStateUtil.isLoading(RequestStateUtil.idle())).toBe(false);
  });

  it('isSuccess() returns true for success state', () => {
    expect(RequestStateUtil.isSuccess(RequestStateUtil.success(42))).toBe(true);
    expect(RequestStateUtil.isSuccess(RequestStateUtil.idle())).toBe(false);
  });

  it('isError() returns true for error state', () => {
    expect(RequestStateUtil.isError(RequestStateUtil.error('x'))).toBe(true);
    expect(RequestStateUtil.isError(RequestStateUtil.idle())).toBe(false);
  });

  it('getData() returns data from success state', () => {
    expect(RequestStateUtil.getData(RequestStateUtil.success('val'))).toBe('val');
  });

  it('getData() returns undefined for non-success states', () => {
    expect(RequestStateUtil.getData(RequestStateUtil.idle())).toBeUndefined();
    expect(RequestStateUtil.getData(RequestStateUtil.loading())).toBeUndefined();
    expect(RequestStateUtil.getData(RequestStateUtil.error('x'))).toBeUndefined();
  });

  it('map() transforms data in success state', () => {
    const state = RequestStateUtil.success(5);
    const mapped = RequestStateUtil.map(state, (n) => n * 2);
    expect(mapped).toEqual({ status: 'success', data: 10 });
  });

  it('map() returns state unchanged for non-success', () => {
    const loading = RequestStateUtil.loading<number>();
    const mapped = RequestStateUtil.map(loading, (n) => n * 2);
    expect(mapped).toEqual({ status: 'loading' });
  });
});

describe('FormStateUtil', () => {
  it('idle() creates idle state', () => {
    expect(FormStateUtil.idle()).toEqual({ status: 'idle' });
  });

  it('submitting() creates submitting state', () => {
    expect(FormStateUtil.submitting()).toEqual({ status: 'submitting' });
  });

  it('success() creates success state', () => {
    expect(FormStateUtil.success('done')).toEqual({ status: 'success', data: 'done' });
  });

  it('error() creates error state', () => {
    expect(FormStateUtil.error('bad')).toEqual({ status: 'error', message: 'bad' });
  });

  it('isSubmitting() checks submitting status', () => {
    expect(FormStateUtil.isSubmitting(FormStateUtil.submitting())).toBe(true);
    expect(FormStateUtil.isSubmitting(FormStateUtil.idle())).toBe(false);
  });

  it('canSubmit() returns true for idle and error states', () => {
    expect(FormStateUtil.canSubmit(FormStateUtil.idle())).toBe(true);
    expect(FormStateUtil.canSubmit(FormStateUtil.error('x'))).toBe(true);
    expect(FormStateUtil.canSubmit(FormStateUtil.submitting())).toBe(false);
    expect(FormStateUtil.canSubmit(FormStateUtil.success(undefined))).toBe(false);
  });
});
