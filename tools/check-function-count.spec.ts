import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluate, countFunctionLibs } from './check-function-count';

describe('evaluate', () => {
  it('passes when the count sits exactly on the baseline', () => {
    const verdict = evaluate(215, 215);

    expect(verdict.ok).toBe(true);
    expect(verdict.message).toContain('215');
  });

  it('fails when a new function is added, and points at the router pattern', () => {
    const verdict = evaluate(216, 215);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.kind).toBe('grew');
    expect(verdict.message).toContain('went UP');
    expect(verdict.message).toContain('ADR-029');
    // Must tell the reader the escape hatch exists, not just say no.
    expect(verdict.message).toContain('--fix');
  });

  it('fails when functions are removed but the baseline was not lowered', () => {
    // This is what makes it a ratchet rather than a ceiling — the improvement
    // has to be committed or a later PR silently reclaims the headroom.
    const verdict = evaluate(202, 215);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.kind).toBe('shrank');
    expect(verdict.message).toContain('went DOWN');
    expect(verdict.message).toContain('--fix');
  });

  it('treats a large consolidation the same as a small one', () => {
    const verdict = evaluate(25, 215);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.kind).toBe('shrank');
  });
});

describe('countFunctionLibs', () => {
  it('counts directories and ignores loose files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fn-count-'));
    try {
      mkdirSync(join(dir, 'get-classes'));
      mkdirSync(join(dir, 'create-class'));
      mkdirSync(join(dir, 'delete-class'));
      writeFileSync(join(dir, 'README.md'), '# not a function\n');
      writeFileSync(join(dir, '.DS_Store'), '');

      expect(countFunctionLibs(dir)).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns 0 for an empty directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fn-count-empty-'));
    try {
      expect(countFunctionLibs(dir)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the committed baseline', () => {
  it('matches the real function-library count in this repo', () => {
    // The guard is worthless if the checked-in baseline has drifted from
    // reality — this spec fails the moment they diverge.
    const baseline = require('../function-count-baseline.json') as {
      maxFunctions: number;
    };

    expect(countFunctionLibs()).toBe(baseline.maxFunctions);
  });
});
