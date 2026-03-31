import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for etsy-auth-url Cloud Function
 *
 * Tests the handler logic: OAuth URL generation and PKCE state storage.
 */

// Define mocks using vi.hoisted
const mocks = vi.hoisted(() => {
  return {
    saveOAuthState: vi.fn(),
    generateAuthUrl: vi.fn(),
    capturedHandler: null as ((...args: unknown[]) => Promise<unknown>) | null,
  };
});

// Mock database
vi.mock('@maple/firebase/database', () => ({
  saveOAuthState: mocks.saveOAuthState,
}));

// Mock EtsyClient
vi.mock('@maple/firebase/etsy', () => ({
  EtsyClient: class {
    oauth = { generateAuthUrl: mocks.generateAuthUrl };
  },
}));

// Mock firebase functions — capture the handler
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

// Import after mocks
import './etsy-auth-url';

describe('etsyAuthUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateAuthUrl.mockReturnValue({
      url: 'https://www.etsy.com/oauth/connect?client_id=test-key&scope=listings_r',
      codeVerifier: 'test-verifier-123',
      state: 'test-state-abc',
    });
    mocks.saveOAuthState.mockResolvedValue(undefined);
  });

  it('generates an OAuth URL and stores PKCE state', async () => {
    const result = await mocks.capturedHandler!(
      {},
      { uid: 'admin-1' },
      { ETSY_API_KEY: 'test-key', ETSY_SHARED_SECRET: 'test-secret' },
      { ETSY_REDIRECT_URI: 'https://example.com/callback' }
    );

    expect(mocks.generateAuthUrl).toHaveBeenCalledWith(
      'listings_r listings_w listings_d shops_r transactions_r'
    );
    expect(mocks.saveOAuthState).toHaveBeenCalledWith(
      'test-state-abc',
      'test-verifier-123'
    );
    expect(result).toEqual({
      url: 'https://www.etsy.com/oauth/connect?client_id=test-key&scope=listings_r',
      state: 'test-state-abc',
    });
  });

  it('uses custom scopes when provided', async () => {
    await mocks.capturedHandler!(
      { scopes: 'shops_r' },
      { uid: 'admin-1' },
      { ETSY_API_KEY: 'key', ETSY_SHARED_SECRET: 'secret' },
      { ETSY_REDIRECT_URI: 'https://example.com/callback' }
    );

    expect(mocks.generateAuthUrl).toHaveBeenCalledWith('shops_r');
  });
});
