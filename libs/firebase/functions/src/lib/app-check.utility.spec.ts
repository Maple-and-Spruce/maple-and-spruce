import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyToken: vi.fn() }));

vi.mock('firebase-admin/app-check', () => ({
  getAppCheck: () => ({ verifyToken: mocks.verifyToken }),
}));

import {
  resolveAppCheckMode,
  verifyAppCheckToken,
  type AppCheckMode,
} from './app-check.utility';

describe('resolveAppCheckMode', () => {
  it.each<[AppCheckMode | undefined, string | undefined, AppCheckMode]>([
    // the env value is a ceiling on what the endpoint declares
    ['enforce', 'enforce', 'enforce'],
    ['enforce', 'monitor', 'monitor'],
    ['enforce', 'off', 'off'],
    ['monitor', 'enforce', 'monitor'],
    ['monitor', 'monitor', 'monitor'],
    ['off', 'enforce', 'off'],
    [undefined, 'enforce', 'off'],
    // an unset or unrecognised env value never turns checking on
    ['enforce', undefined, 'off'],
    ['enforce', '', 'off'],
    ['enforce', 'strict', 'off'],
    // tolerant of case and whitespace in the .env file
    ['enforce', ' Enforce ', 'enforce'],
  ])('endpoint %s under env %s → %s', (endpoint, env, expected) => {
    expect(resolveAppCheckMode(endpoint, env)).toBe(expected);
  });
});

describe('verifyAppCheckToken', () => {
  const ensureInit = vi.fn();

  beforeEach(() => {
    mocks.verifyToken.mockReset();
    ensureInit.mockReset();
  });

  it('reports a missing header without calling the Admin SDK', async () => {
    await expect(verifyAppCheckToken({}, ensureInit)).resolves.toEqual({
      result: 'missing',
    });
    await expect(
      verifyAppCheckToken({ 'x-firebase-appcheck': '  ' }, ensureInit)
    ).resolves.toEqual({ result: 'missing' });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });

  it('reports a verified token with its app id', async () => {
    mocks.verifyToken.mockResolvedValue({ appId: 'app-1', token: {} });
    await expect(
      verifyAppCheckToken({ 'x-firebase-appcheck': 'tok' }, ensureInit)
    ).resolves.toEqual({ result: 'valid', appId: 'app-1' });
    expect(ensureInit).toHaveBeenCalled();
    expect(mocks.verifyToken).toHaveBeenCalledWith('tok');
  });

  it('takes the first value of a repeated header', async () => {
    mocks.verifyToken.mockResolvedValue({ appId: 'app-1' });
    await verifyAppCheckToken(
      { 'x-firebase-appcheck': ['first', 'second'] },
      ensureInit
    );
    expect(mocks.verifyToken).toHaveBeenCalledWith('first');
  });

  it('reports a rejected token as invalid instead of throwing', async () => {
    mocks.verifyToken.mockRejectedValue(new Error('bad token'));
    await expect(
      verifyAppCheckToken({ 'x-firebase-appcheck': 'tok' }, ensureInit)
    ).resolves.toEqual({ result: 'invalid' });
  });
});
