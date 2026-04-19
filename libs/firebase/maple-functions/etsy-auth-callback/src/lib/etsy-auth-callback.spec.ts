import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for etsy-auth-callback Cloud Function
 *
 * Tests the handler logic: state validation, code exchange, and the
 * shop-ID fetch (which now goes through fetchUserShopId from the etsy
 * lib — we assert both a happy path and a "shop ID not found" path so
 * the OAuth completes either way).
 */

const mocks = vi.hoisted(() => {
  return {
    consumeOAuthState: vi.fn(),
    updateTokenShopId: vi.fn(),
    exchangeCode: vi.fn(),
    fetchUserShopId: vi.fn(),
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
  fetchUserShopId: mocks.fetchUserShopId,
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
  });

  function tokenExchange() {
    mocks.consumeOAuthState.mockResolvedValue('verifier-123');
    mocks.exchangeCode.mockResolvedValue({
      accessToken: '99999.token',
      refreshToken: '99999.refresh',
      expiresAt: Date.now() + 3600000,
      shopId: '',
      userId: '99999',
    });
    mocks.updateTokenShopId.mockResolvedValue(undefined);
  }

  it('exchanges code for tokens and persists the shop ID', async () => {
    tokenExchange();
    mocks.fetchUserShopId.mockResolvedValue({
      shopId: '12345',
      status: 200,
    });

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
    expect(mocks.fetchUserShopId).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '99999',
        accessToken: '99999.token',
        apiKey: 'key',
        sharedSecret: 'secret',
      })
    );
    expect(mocks.updateTokenShopId).toHaveBeenCalledWith('12345');
    expect(result).toEqual({
      success: true,
      shopId: '12345',
      userId: '99999',
    });
  });

  it('still succeeds when the shop-ID lookup returns null', async () => {
    tokenExchange();
    mocks.fetchUserShopId.mockResolvedValue({
      shopId: null,
      status: 200,
      reason: 'Unrecognized response shape',
    });

    const result = await mocks.capturedHandler!(
      { code: 'auth-code', state: 'valid-state' },
      { uid: 'admin-1' },
      secrets,
      strings
    );

    expect(mocks.updateTokenShopId).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      shopId: undefined,
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
});
