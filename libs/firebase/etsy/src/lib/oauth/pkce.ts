/**
 * PKCE (Proof Key for Code Exchange) utilities
 *
 * Etsy requires PKCE with S256 challenge method for all OAuth flows.
 * The code verifier is a high-entropy random string (43-128 chars),
 * and the challenge is its SHA-256 hash encoded as base64url.
 *
 * @see https://developers.etsy.com/documentation/essentials/authentication/
 * @see RFC 7636
 */
import { randomBytes, createHash } from 'node:crypto';

/** Characters allowed in the PKCE code verifier per RFC 7636 */
const VERIFIER_CHARSET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Generate a cryptographically random PKCE code verifier.
 *
 * @param length - Verifier length (43-128 per spec, default 64)
 * @returns A random string from the allowed charset
 */
export function generateCodeVerifier(length = 64): string {
  if (length < 43 || length > 128) {
    throw new Error('Code verifier length must be between 43 and 128');
  }
  const bytes = randomBytes(length);
  let verifier = '';
  for (let i = 0; i < length; i++) {
    verifier += VERIFIER_CHARSET[bytes[i] % VERIFIER_CHARSET.length];
  }
  return verifier;
}

/**
 * Derive the S256 code challenge from a code verifier.
 *
 * @param verifier - The code verifier string
 * @returns Base64url-encoded SHA-256 hash of the verifier
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = createHash('sha256').update(verifier).digest('base64');
  return base64ToBase64Url(hash);
}

/**
 * Generate a random state string for CSRF protection.
 *
 * @returns A 32-character hex string
 */
export function generateState(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Convert standard base64 to base64url encoding.
 * Replaces + with -, / with _, and strips trailing =.
 */
function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
