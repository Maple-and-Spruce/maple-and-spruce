import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for etsy-auth-callback Cloud Function
 *
 * Tests the handler logic: state validation, code exchange, and shop ID fetch.
 */

const mocks = vi.hoisted(() => {
  return {
    consumeOAuthState: vi.fn(),
    updateTokenShopId: vi.fn(),
    exchangeCode: vi.fn(),
    mockFetch: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: {
    getTokens: vi.fn(),
    saveTokens: vi.fn(),
  },
  consumeOAuthState: mocks.consumeOAuthState,
  updateTokenShopId: mocks.updateTokenShopId,
}));

vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    oauth = { exchangeCode: mocks.exchangeCode };
  },
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      usingSecrets: vi.fn().mockReturnThis(),
      usingStrings: vi.fn().mockReturnThis(),
      requiringRole: vi.fn().mockReturnThis(),
      handle: vi.fn((handler: (...args: unknown[]) => Promise<unknown>) => {
        mocks.capturedHandler = handler;
        return 'mock-function';
      }),
    },
  },
  Role: { Admin: 'admin' },
}));

import './etsy-auth-callback';

describe('etsyAuthCallback', () => {
  const secrets = { ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret' };
  const strings = { ETSY_REDIRECT_URI: 'https://example.com/callback' };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.mockFetch);
  });

  it('exchanges code for tokens and fetches shop ID', async () => {
    mocks.consumeOAuthState.mockResolvedValue('verifier-123');
    mocks.exchangeCode.mockResolvedValue({
      accessToken: '99999.token',
      refreshToken: '99999.refresh',
      expiresAt: Date.now() + 3600000,
      shopId: '',
      userId: '99999',
    });
    mocks.mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        results: [{ shop_id: 12345 }],
      }),
    });
    mocks.updateTokenShopId.mockResolvedValue(undefined);

    const result = await mocks.capturedHandler!(
      { code: 'auth-code', state: 'valid-state' },
      { uid: 'admin-1' },
      secrets,
      strings
    );

    expect(mocks.consumeOAuthState).toHaveBeenCalledWith('valid-state');
    expect(mocks.exchangeCode).toHaveBeenCalledWith({
      code: 'auth-code',
      codeVerifier: 'verifier-123',
    });
    expect(mocks.updateTokenShopId).toHaveBeenCalledWith('12345');
    expect(result).toEqual({
      success: true,
      shopId: '12345',
      userId: '99999',
    });
  });

  it('throws on invalid state', async () => {
    mocks.consumeOAuthState.mockResolvedValue(null);

    await expect(
      mocks.capturedHandler!(
        { code: 'auth-code', state: 'bad-state' },
        { uid: 'admin-1' },
        secrets,
        strings
      )
    ).rejects.toThrow('Invalid or expired OAuth state');
  });

  it('throws when code or state is missing', async () => {
    await expect(
      mocks.capturedHandler!({}, { uid: 'admin-1' }, secrets, strings)
    ).rejects.toThrow('Missing required parameters');
  });

  it('succeeds even if shop ID fetch fails', async () => {
    mocks.consumeOAuthState.mockResolvedValue('verifier');
    mocks.exchangeCode.mockResolvedValue({
      accessToken: '99999.token',
      refreshToken: '99999.refresh',
      expiresAt: Date.now() + 3600000,
      shopId: '',
      userId: '99999',
    });
    mocks.mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await mocks.capturedHandler!(
      { code: 'code', state: 'state' },
      { uid: 'admin-1' },
      secrets,
      strings
    );

    expect(result).toEqual({
      success: true,
      shopId: undefined,
      userId: '99999',
    });
  });
});
