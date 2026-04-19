import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';

import { assertValid, runChecks } from './functions.utility';

function suite(
  isValid: boolean,
  errors: Record<string, string[]> = {}
): { isValid: () => boolean; getErrors: () => Record<string, string[]> } {
  return {
    isValid: () => isValid,
    getErrors: () => errors,
  };
}

describe('assertValid', () => {
  it('returns void when the result is valid', () => {
    expect(() => assertValid(suite(true))).not.toThrow();
  });

  it('throws an HttpsError(invalid-argument) when invalid', () => {
    let caught: unknown;
    try {
      assertValid(suite(false, { email: ['is required'] }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpsError);
    expect((caught as HttpsError).code).toBe('invalid-argument');
    expect((caught as HttpsError).message).toContain('email: is required');
  });
});

describe('runChecks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when neither validator nor uniqueness checks are set', async () => {
    await expect(runChecks({ foo: 'bar' }, {})).resolves.toBeUndefined();
  });

  it('runs the validator and throws on invalid input', async () => {
    const validator = vi.fn(() => suite(false, { name: ['too short'] }));
    await expect(runChecks({ name: 'a' }, { validator })).rejects.toThrow(
      /name: too short/
    );
    expect(validator).toHaveBeenCalledWith({ name: 'a' });
  });

  it('runs the validator first, then uniqueness — uniqueness skipped when validation fails', async () => {
    const validator = vi.fn(() => suite(false, { email: ['invalid'] }));
    const exists = vi.fn().mockResolvedValue(true);
    await expect(
      runChecks(
        { email: 'x' },
        {
          validator,
          uniquenessChecks: [{ field: 'email', exists }],
        }
      )
    ).rejects.toThrow();
    expect(exists).not.toHaveBeenCalled();
  });

  it('throws already-exists when a uniqueness check fails', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    let caught: unknown;
    try {
      await runChecks(
        { email: 'taken@example.com' },
        {
          uniquenessChecks: [{ entity: 'Artist', field: 'email', exists }],
        }
      );
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HttpsError);
    expect((caught as HttpsError).code).toBe('already-exists');
    expect((caught as HttpsError).message).toContain('taken@example.com');
    expect(exists).toHaveBeenCalledWith('taken@example.com');
  });

  it('passes when uniqueness check returns false', async () => {
    const exists = vi.fn().mockResolvedValue(false);
    await expect(
      runChecks(
        { email: 'free@example.com' },
        { uniquenessChecks: [{ field: 'email', exists }] }
      )
    ).resolves.toBeUndefined();
  });

  it('skips uniqueness check when value is undefined', async () => {
    const exists = vi.fn();
    await expect(
      runChecks({}, { uniquenessChecks: [{ field: 'email', exists }] })
    ).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('skips uniqueness check when value is null', async () => {
    const exists = vi.fn();
    await expect(
      runChecks(
        { email: null },
        { uniquenessChecks: [{ field: 'email', exists }] }
      )
    ).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('skips uniqueness check when when() returns false', async () => {
    const exists = vi.fn().mockResolvedValue(true);
    await expect(
      runChecks(
        { email: 'same@example.com', existingEmail: 'same@example.com' },
        {
          uniquenessChecks: [
            {
              field: 'email',
              exists,
              when: (data: { email?: string; existingEmail?: string }) =>
                data.email !== data.existingEmail,
            },
          ],
        }
      )
    ).resolves.toBeUndefined();
    expect(exists).not.toHaveBeenCalled();
  });

  it('runs uniqueness check when when() returns true', async () => {
    const exists = vi.fn().mockResolvedValue(false);
    await expect(
      runChecks(
        { email: 'new@example.com', existingEmail: 'old@example.com' },
        {
          uniquenessChecks: [
            {
              field: 'email',
              exists,
              when: (data: { email?: string; existingEmail?: string }) =>
                data.email !== data.existingEmail,
            },
          ],
        }
      )
    ).resolves.toBeUndefined();
    expect(exists).toHaveBeenCalledWith('new@example.com');
  });

  it('runs multiple uniqueness checks in order', async () => {
    const order: string[] = [];
    const existsEmail = vi.fn(async () => {
      order.push('email');
      return false;
    });
    const existsHandle = vi.fn(async () => {
      order.push('handle');
      return false;
    });
    await runChecks(
      { email: 'a@b.com', handle: 'a' },
      {
        uniquenessChecks: [
          { field: 'email', exists: existsEmail },
          { field: 'handle', exists: existsHandle },
        ],
      }
    );
    expect(order).toEqual(['email', 'handle']);
  });
});
