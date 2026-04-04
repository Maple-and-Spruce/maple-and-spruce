/**
 * Etsy Token Repository
 *
 * Implements the TokenStorage interface from @maple/firebase/etsy
 * using Firestore as the persistence layer. Stores OAuth tokens
 * in the _config/etsy-tokens document.
 *
 * Also stores PKCE state (code verifier + state) for the OAuth flow
 * in _config/etsy-oauth-state (temporary, consumed during callback).
 */
import { db } from './utilities/database.config';
import type { TokenStorage, TokenData } from '@maple/firebase/etsy';

const TOKEN_DOC_PATH = '_config/etsy-tokens';
const OAUTH_STATE_DOC_PATH = '_config/etsy-oauth-state';

/**
 * Firestore implementation of the Etsy TokenStorage interface.
 *
 * This bridges the framework-agnostic Etsy client library with
 * the Firebase infrastructure used by Cloud Functions.
 */
export const FirestoreTokenStorage: TokenStorage = {
  async getTokens(): Promise<TokenData | null> {
    const doc = await db.doc(TOKEN_DOC_PATH).get();
    if (!doc.exists) return null;

    const data = doc.data()!;
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
      shopId: data.shopId ?? '',
      userId: data.userId ?? '',
    };
  },

  async saveTokens(tokens: TokenData): Promise<void> {
    await db.doc(TOKEN_DOC_PATH).set(
      {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        shopId: tokens.shopId,
        userId: tokens.userId,
        updatedAt: new Date(),
      },
      { merge: true }
    );
  },
};

/**
 * Store PKCE state during the OAuth flow.
 *
 * Called by etsy-auth-url to persist the code verifier and state
 * so etsy-auth-callback can retrieve them.
 */
export async function saveOAuthState(
  state: string,
  codeVerifier: string
): Promise<void> {
  await db.doc(OAUTH_STATE_DOC_PATH).set({
    state,
    codeVerifier,
    createdAt: new Date(),
  });
}

/**
 * Retrieve and consume PKCE state during the OAuth callback.
 *
 * Returns the code verifier if the state matches, then deletes
 * the temporary document.
 *
 * @param state - The state parameter from the Etsy redirect
 * @returns The code verifier, or null if state doesn't match
 */
export async function consumeOAuthState(
  state: string
): Promise<string | null> {
  const doc = await db.doc(OAUTH_STATE_DOC_PATH).get();
  if (!doc.exists) return null;

  const data = doc.data()!;
  if (data.state !== state) return null;

  const codeVerifier = data.codeVerifier as string;

  // Delete the temporary state document
  await db.doc(OAUTH_STATE_DOC_PATH).delete();

  return codeVerifier;
}

/**
 * Update the shop ID on stored tokens.
 *
 * Called after the initial OAuth exchange, since the token response
 * doesn't include the shop ID — it must be fetched via a separate API call.
 */
export async function updateTokenShopId(shopId: string): Promise<void> {
  await db.doc(TOKEN_DOC_PATH).update({
    shopId,
    updatedAt: new Date(),
  });
}
