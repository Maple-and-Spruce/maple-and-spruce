import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TokenStorage, TokenData } from './types';
import { OAuthService } from './oauth.service';

function createMockStorage(tokens: TokenData | null = null): TokenStorage {
  return {
    getTokens: vi.fn().mockResolvedValue(tokens),
    saveTokens: vi.fn().mockResolvedValue(undefined),
  };
}

function createValidTokens(overrides?: Partial<TokenData>): TokenData {
  return {
    accessToken: '12345.valid-token',
    refreshToken: '12345.valid-refresh',
    expiresAt: Date.now() + 3600 * 1000,
    shopId: 'shop-1',
    userId: '12345',
    ...overrides,
  };
}

describe('OAuthService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateAuthUrl', () => {
    it('generates a valid Etsy OAuth URL with PKCE params', () => {
      const storage = createMockStorage();
      const service = new OAuthService('test-api-key', storage, 'https://example.com/callback');

      const result = service.generateAuthUrl('listings_r listings_w');

      expect(result.url).toContain('https://www.etsy.com/oauth/connect');
      expect(result.url).toContain('response_type=code');
      expect(result.url).toContain('client_id=test-api-key');
      expect(result.url).toContain('redirect_uri=https%3A%2F%2Fexample.com%2Fcallback');
      expect(result.url).toContain('scope=listings_r+listings_w');
      expect(result.url).toContain('code_challenge_method=S256');
      expect(result.url).toContain('code_challenge=');
      expect(result.url).toContain('state=');
      expect(result.codeVerifier).toHaveLength(64);
      expect(result.state).toHaveLength(32);
    });

    it('throws if redirectUri is not configured', () => {
      const storage = createMockStorage();
      const service = new OAuthService('test-api-key', storage);

      expect(() => service.generateAuthUrl('listings_r')).toThrow(
        'redirectUri is required'
      );
    });
  });

  describe('exchangeCode', () => {
    it('exchanges an authorization code for tokens', async () => {
      const storage = createMockStorage();
      const service = new OAuthService('test-api-key', storage, 'https://example.com/callback');

      const mockResponse: Response = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: '99999.new-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: '99999.new-refresh-token',
        }),
      } as unknown as Response;

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const result = await service.exchangeCode({
        code: 'auth-code-123',
        codeVerifier: 'test-verifier',
      });

      expect(result.accessToken).toBe('99999.new-access-token');
      expect(result.refreshToken).toBe('99999.new-refresh-token');
      expect(result.userId).toBe('99999');
      expect(storage.saveTokens).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: '99999.new-access-token' })
      );

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.etsy.com/v3/public/oauth/token');
      expect(fetchCall[1]?.method).toBe('POST');
    });

    it('throws on failed exchange', async () => {
      const storage = createMockStorage();
      const service = new OAuthService('test-api-key', storage, 'https://example.com/callback');

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('invalid_grant'),
      } as unknown as Response);

      await expect(
        service.exchangeCode({ code: 'bad', codeVerifier: 'bad' })
      ).rejects.toThrow('Etsy token exchange failed (400)');
    });
  });

  describe('getValidAccessToken', () => {
    it('returns the stored token if not expired', async () => {
      const tokens = createValidTokens();
      const storage = createMockStorage(tokens);
      const service = new OAuthService('test-api-key', storage);

      const result = await service.getValidAccessToken();
      expect(result).toBe('12345.valid-token');
    });

    it('refreshes the token if expired', async () => {
      const expiredTokens = createValidTokens({
        expiresAt: Date.now() - 1000, // expired
      });
      const storage = createMockStorage(expiredTokens);
      const service = new OAuthService('test-api-key', storage);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: '12345.refreshed-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: '12345.refreshed-refresh',
        }),
      } as unknown as Response);

      const result = await service.getValidAccessToken();
      expect(result).toBe('12345.refreshed-token');
      expect(storage.saveTokens).toHaveBeenCalled();
    });

    it('refreshes if within the 5-minute buffer', async () => {
      const almostExpired = createValidTokens({
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes left (within 5-min buffer)
      });
      const storage = createMockStorage(almostExpired);
      const service = new OAuthService('test-api-key', storage);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: '12345.refreshed',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: '12345.refreshed-refresh',
        }),
      } as unknown as Response);

      const result = await service.getValidAccessToken();
      expect(result).toBe('12345.refreshed');
    });

    it('throws if no tokens are stored', async () => {
      const storage = createMockStorage(null);
      const service = new OAuthService('test-api-key', storage);

      await expect(service.getValidAccessToken()).rejects.toThrow(
        'No Etsy OAuth tokens found'
      );
    });
  });

  describe('hasTokens', () => {
    it('returns true when tokens exist', async () => {
      const storage = createMockStorage(createValidTokens());
      const service = new OAuthService('test-api-key', storage);
      expect(await service.hasTokens()).toBe(true);
    });

    it('returns false when no tokens exist', async () => {
      const storage = createMockStorage(null);
      const service = new OAuthService('test-api-key', storage);
      expect(await service.hasTokens()).toBe(false);
    });
  });
});
