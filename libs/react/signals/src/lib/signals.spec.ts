// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  signal,
  computed,
  effect,
  batch,
  untracked,
  useSignal,
  useComputed,
  useSignalEffect,
  useSignals,
} from './signals';

describe('signals re-exports', () => {
  it('exports core primitives', () => {
    expect(typeof signal).toBe('function');
    expect(typeof computed).toBe('function');
    expect(typeof effect).toBe('function');
    expect(typeof batch).toBe('function');
    expect(typeof untracked).toBe('function');
  });

  it('exports React hooks', () => {
    expect(typeof useSignal).toBe('function');
    expect(typeof useComputed).toBe('function');
    expect(typeof useSignalEffect).toBe('function');
  });

  it('exports runtime hook', () => {
    expect(typeof useSignals).toBe('function');
  });
});
