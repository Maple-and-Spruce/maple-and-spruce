/**
 * Etsy OAuth 2.0 service
 *
 * Manages the full OAuth lifecycle: authorization URL generation,
 * code exchange, token refresh, and automatic token management.
 *
 * @see https://developers.etsy.com/documentation/essentials/authentication/
 */
import type {
  TokenStorage,
  TokenData,
  AuthUrlResult,
  TokenExchangeParams,
  EtsyTokenResponse,
} from './types.js';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from './pkce.js';

const ETSY_AUTH_URL = 'https://www.etsy.com/oauth/connect';
const ETSY_TOKEN_URL = 'https://api.etsy.com/v3/public/oauth/token';

/** Buffer before expiry to trigger refresh (5 minutes) */
const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export class OAuthService {
  constructor(
    private readonly apiKey: string,
    private readonly tokenStorage: TokenStorage,
    private readonly redirectUri?: string
  ) {}

  /**
   * Generate an OAuth authorization URL with PKCE.
   *
   * The returned `codeVerifier` and `state` must be stored (e.g. in a temp
   * Firestore document) for use during the callback/token exchange.
   *
   * @param scopes - Space-separated OAuth scopes
   * @returns Authorization URL, code verifier, and state
   */
  generateAuthUrl(scopes: string): AuthUrlResult {
    if (!this.redirectUri) {
      throw new Error('redirectUri is required for OAuth authorization flow');
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.apiKey,
      redirect_uri: this.redirectUri,
      scope: scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    return {
      url: `${ETSY_AUTH_URL}?${params.toString()}`,
      codeVerifier,
      state,
    };
  }

  /**
   * Exchange an authorization code for access and refresh tokens.
   *
   * Call this from the OAuth callback handler. Tokens are automatically
   * persisted via the configured TokenStorage.
   *
   * @param params - Authorization code and code verifier
   * @returns The stored token data
   */
  async exchangeCode(params: TokenExchangeParams): Promise<TokenData> {
    if (!this.redirectUri) {
      throw new Error('redirectUri is required for token exchange');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.apiKey,
      redirect_uri: this.redirectUri,
      code: params.code,
      code_verifier: params.codeVerifier,
    });

    const response = await fetch(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Etsy token exchange failed (${response.status}): ${errorText}`
      );
    }

    const tokenResponse = (await response.json()) as EtsyTokenResponse;
    const tokenData = this.parseTokenResponse(tokenResponse);
    await this.tokenStorage.saveTokens(tokenData);
    return tokenData;
  }

  /**
   * Get a valid access token, refreshing if necessary.
   *
   * This is the primary method called by the HTTP layer before each request.
   * It reads from storage, checks expiry (with a 5-minute buffer), and
   * refreshes if needed.
   *
   * @returns A valid access token string
   * @throws If no tokens are stored or refresh fails
   */
  async getValidAccessToken(): Promise<string> {
    const tokens = await this.tokenStorage.getTokens();
    if (!tokens) {
      throw new Error(
        'No Etsy OAuth tokens found. Complete the authorization flow first.'
      );
    }

    if (Date.now() < tokens.expiresAt - EXPIRY_BUFFER_MS) {
      return tokens.accessToken;
    }

    const refreshed = await this.refreshAccessToken(tokens.refreshToken);
    return refreshed.accessToken;
  }

  /**
   * Refresh an expired access token.
   *
   * @param refreshToken - The refresh token to exchange
   * @returns Updated token data (also persisted to storage)
   */
  async refreshAccessToken(refreshToken: string): Promise<TokenData> {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.apiKey,
      refresh_token: refreshToken,
    });

    const response = await fetch(ETSY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Etsy token refresh failed (${response.status}): ${errorText}`
      );
    }

    const tokenResponse = (await response.json()) as EtsyTokenResponse;
    const tokenData = this.parseTokenResponse(tokenResponse);
    await this.tokenStorage.saveTokens(tokenData);
    return tokenData;
  }

  /**
   * Check if valid tokens exist in storage.
   *
   * @returns True if tokens exist (regardless of expiry — they may be refreshable)
   */
  async hasTokens(): Promise<boolean> {
    const tokens = await this.tokenStorage.getTokens();
    return tokens !== null;
  }

  /**
   * Parse Etsy's token response into our TokenData format.
   *
   * Etsy access tokens are prefixed with the user ID: "{userId}.{token}".
   * The shop ID is not in the token response — it must be fetched via API
   * after initial auth, or provided by the caller.
   */
  private parseTokenResponse(response: EtsyTokenResponse): TokenData {
    const userId = response.access_token.split('.')[0];
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiresAt: Date.now() + response.expires_in * 1000,
      shopId: '', // Set after first API call to getShop or by caller
      userId,
    };
  }
}
