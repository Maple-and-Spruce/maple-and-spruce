import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for get-etsy-connection-status Cloud Function
 */

const mocks = vi.hoisted(() => {
  return {
    getTokens: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

vi.mock('@maple/firebase/database', () => ({
  FirestoreTokenStorage: {
    getTokens: mocks.getTokens,
    saveTokens: vi.fn(),
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

import './get-etsy-connection-status';

describe('getEtsyConnectionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns not connected when no tokens exist', async () => {
    mocks.getTokens.mockResolvedValue(null);

    const result = await mocks.capturedHandler!({}, { uid: 'admin-1' }, {}, {});

    expect(result).toEqual({
      connected: false,
      tokenValid: false,
    });
  });

  it('returns connected with valid token', async () => {
    mocks.getTokens.mockResolvedValue({
      accessToken: '99999.token',
      refreshToken: '99999.refresh',
      expiresAt: Date.now() + 3600000,
      shopId: 'shop-123',
      userId: '99999',
    });

    const result = await mocks.capturedHandler!({}, { uid: 'admin-1' }, {}, {});

    expect(result).toMatchObject({
      connected: true,
      tokenValid: true,
      shopId: 'shop-123',
      userId: '99999',
    });
  });

  it('returns connected but expired when token has lapsed', async () => {
    mocks.getTokens.mockResolvedValue({
      accessToken: '99999.token',
      refreshToken: '99999.refresh',
      expiresAt: Date.now() - 1000,
      shopId: 'shop-123',
      userId: '99999',
    });

    const result = await mocks.capturedHandler!({}, { uid: 'admin-1' }, {}, {});

    expect(result).toMatchObject({
      connected: true,
      tokenValid: false,
      shopId: 'shop-123',
    });
  });
});
