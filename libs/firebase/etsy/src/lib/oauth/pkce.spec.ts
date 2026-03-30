import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from './pkce';

describe('generateCodeVerifier', () => {
  it('generates a string of the default length (64)', () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(64);
  });

  it('generates a string of a custom length', () => {
    const verifier = generateCodeVerifier(43);
    expect(verifier).toHaveLength(43);

    const verifier128 = generateCodeVerifier(128);
    expect(verifier128).toHaveLength(128);
  });

  it('only contains allowed characters', () => {
    const verifier = generateCodeVerifier();
    const allowedPattern = /^[A-Za-z0-9\-._~]+$/;
    expect(verifier).toMatch(allowedPattern);
  });

  it('throws for length < 43', () => {
    expect(() => generateCodeVerifier(42)).toThrow(
      'Code verifier length must be between 43 and 128'
    );
  });

  it('throws for length > 128', () => {
    expect(() => generateCodeVerifier(129)).toThrow(
      'Code verifier length must be between 43 and 128'
    );
  });

  it('generates unique values on each call', () => {
    const a = generateCodeVerifier();
    const b = generateCodeVerifier();
    expect(a).not.toBe(b);
  });
});

describe('generateCodeChallenge', () => {
  it('produces a base64url-encoded SHA-256 hash', () => {
    const verifier = 'test-verifier-string-that-is-long-enough-for-pkce';
    const challenge = generateCodeChallenge(verifier);

    // Should not contain standard base64 characters that are replaced
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
    expect(challenge).not.toContain('=');
  });

  it('produces a deterministic output for the same input', () => {
    const verifier = 'deterministic-test-verifier-for-code-challenge';
    const a = generateCodeChallenge(verifier);
    const b = generateCodeChallenge(verifier);
    expect(a).toBe(b);
  });

  it('matches manual SHA-256 + base64url computation', () => {
    const verifier = 'manual-hash-test-verifier-string-for-testing';
    const challenge = generateCodeChallenge(verifier);

    const expectedHash = createHash('sha256').update(verifier).digest('base64');
    const expectedChallenge = expectedHash
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    expect(challenge).toBe(expectedChallenge);
  });
});

describe('generateState', () => {
  it('generates a 32-character hex string', () => {
    const state = generateState();
    expect(state).toHaveLength(32);
    expect(state).toMatch(/^[0-9a-f]+$/);
  });

  it('generates unique values on each call', () => {
    const a = generateState();
    const b = generateState();
    expect(a).not.toBe(b);
  });
});
