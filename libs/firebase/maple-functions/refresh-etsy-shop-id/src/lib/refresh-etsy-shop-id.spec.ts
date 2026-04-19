import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for refreshEtsyShopId Cloud Function.
 */

const mocks = vi.hoisted(() => ({
  getTokens: vi.fn(),
  updateTokenShopId: vi.fn(),
  fetchUserShopId: vi.fn(),
  capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
}));

vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: {
    getTokens: mocks.getTokens,
    saveTokens: vi.fn(),
  },
  updateTokenShopId: mocks.updateTokenShopId,
}));

vi.mock('@maple/firebase/etsy', () => ({
  fetchUserShopId: mocks.fetchUserShopId,
}));

vi.mock('@maple/firebase/functions', () => ({
  Functions: {
    endpoint: {
      usingSecrets: vi.fn().mockReturnThis(),
      requiringRole: vi.fn().mockReturnThis(),
      handle: vi.fn((handler: (...args: unknown[]) => Promise<unknown>) => {
        mocks.capturedHandler = handler;
        return 'mock-function';
      }),
    },
  },
  Role: { Admin: 'admin' },
}));

import './refresh-etsy-shop-id';

describe('refreshEtsyShopId', () => {
  const secrets = { ETSY_API_KEY: 'k', ETSY_SHARED_SECRET: 's' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success=false when no tokens are stored', async () => {
    mocks.getTokens.mockResolvedValue(null);

    const result = (await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      secrets
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('not connected');
    expect(mocks.fetchUserShopId).not.toHaveBeenCalled();
  });

  it('returns success=false when the stored tokens lack a user ID', async () => {
    mocks.getTokens.mockResolvedValue({
      accessToken: 't',
      refreshToken: 'r',
      expiresAt: Date.now() + 3600000,
      userId: '',
      shopId: '',
    });

    const result = (await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      secrets
    )) as { success: boolean; error?: string };

    expect(result.success).toBe(false);
    expect(result.error).toContain('user ID');
  });

  it('persists and returns the shop ID on happy path', async () => {
    mocks.getTokens.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
      expiresAt: Date.now() + 3600000,
      userId: '11111',
      shopId: '',
    });
    mocks.fetchUserShopId.mockResolvedValue({
      shopId: '22222',
      status: 200,
    });
    mocks.updateTokenShopId.mockResolvedValue(undefined);

    const result = (await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      secrets
    )) as { success: boolean; shopId?: string };

    expect(mocks.fetchUserShopId).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '11111',
        accessToken: 'acc',
        apiKey: 'k',
        sharedSecret: 's',
      })
    );
    expect(mocks.updateTokenShopId).toHaveBeenCalledWith('22222');
    expect(result).toEqual({ success: true, shopId: '22222' });
  });

  it('returns success=false with the reason when the Etsy call fails', async () => {
    mocks.getTokens.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
      expiresAt: Date.now() + 3600000,
      userId: '11111',
      shopId: '',
    });
    mocks.fetchUserShopId.mockResolvedValue({
      shopId: null,
      status: 403,
      reason: 'missing scope shops_r',
    });

    const result = (await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      secrets
    )) as { success: boolean; status?: number; error?: string };

    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
    expect(result.error).toContain('missing scope');
    expect(mocks.updateTokenShopId).not.toHaveBeenCalled();
  });
});
