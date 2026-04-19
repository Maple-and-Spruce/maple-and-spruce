/**
 * Etsy OAuth API request/response types
 *
 * Types for the Etsy OAuth bootstrap Cloud Functions.
 * These are shared between client and server for type-safe API calls.
 */

// ============================================================================
// Generate Etsy Auth URL
// ============================================================================

export interface EtsyAuthUrlRequest {
  /** OAuth scopes to request (space-separated) */
  scopes?: string;
}

export interface EtsyAuthUrlResponse {
  /** Full authorization URL to redirect the admin to */
  url: string;
  /** State parameter for CSRF validation on callback */
  state: string;
}

// ============================================================================
// Etsy Auth Callback (exchange code for tokens)
// ============================================================================

export interface EtsyAuthCallbackRequest {
  /** Authorization code from Etsy redirect */
  code: string;
  /** State parameter from the redirect (must match original) */
  state: string;
}

export interface EtsyAuthCallbackResponse {
  success: boolean;
  /** Etsy shop ID (fetched after token exchange) */
  shopId?: string;
  /** Etsy user ID (extracted from token) */
  userId?: string;
}

// ============================================================================
// Get Etsy Connection Status
// ============================================================================

export interface GetEtsyConnectionStatusRequest {}

export interface GetEtsyConnectionStatusResponse {
  /** Whether Etsy OAuth tokens exist and are valid */
  connected: boolean;
  /** Whether the access token is currently valid (not expired) */
  tokenValid: boolean;
  /** Etsy shop ID, if connected */
  shopId?: string;
  /** Etsy user ID, if connected */
  userId?: string;
  /** When the access token expires */
  tokenExpiresAt?: number;
}

// ============================================================================
// Refresh Etsy Shop ID
// ============================================================================

export interface RefreshEtsyShopIdRequest {}

export interface RefreshEtsyShopIdResponse {
  /** Whether the shop ID was successfully resolved and persisted. */
  success: boolean;
  /** The resolved shop ID on success. */
  shopId?: string;
  /** HTTP status from Etsy when the lookup failed at the transport level. */
  status?: number;
  /** Human-readable reason when success=false. */
  error?: string;
}
