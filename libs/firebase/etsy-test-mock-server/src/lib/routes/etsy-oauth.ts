/**
 * Etsy v3 OAuth routes.
 *
 * Mocks the token exchange endpoint that etsy-auth-callback calls during
 * OAuth completion. Tests can override the canned response via
 * setTokenExchangeResponse() to simulate error cases.
 */
import type { EtsyMockServer } from '../etsy-mock-server';

interface TokenResponse {
  status: number;
  body: Record<string, unknown>;
}

let tokenResponse: TokenResponse = {
  status: 200,
  body: {
    access_token: '11111.valid-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: '11111.valid-refresh-token',
  },
};

let mockShopId = '22222';

export function setTokenExchangeResponse(resp: TokenResponse): void {
  tokenResponse = resp;
}

export function setShopId(shopId: string): void {
  mockShopId = shopId;
}

export function getMockShopId(): string {
  return mockShopId;
}

export function resetOAuthState(): void {
  tokenResponse = {
    status: 200,
    body: {
      access_token: '11111.valid-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: '11111.valid-refresh-token',
    },
  };
  mockShopId = '22222';
}

export function registerEtsyOAuthRoutes(server: EtsyMockServer): void {
  server.post('/v3/public/oauth/token', () => tokenResponse);
}
