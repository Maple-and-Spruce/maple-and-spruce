/**
 * Etsy Auth URL Cloud Function
 *
 * Generates an OAuth authorization URL with PKCE for connecting
 * the Etsy shop. Stores the PKCE code verifier and state in Firestore
 * for validation during the callback.
 *
 * Admin only — only admins can connect external integrations.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { saveOAuthState } from '@maple/firebase/database';
import { EtsyClient } from '@maple/firebase/etsy';
import type {
  EtsyAuthUrlRequest,
  EtsyAuthUrlResponse,
} from '@maple/ts/firebase/api-types';

/** Default scopes for Maple & Spruce's Etsy integration */
const DEFAULT_SCOPES = 'listings_r listings_w listings_d shops_r transactions_r';

/** Secret names for Etsy API credentials */
export const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;

/** String param names for Etsy configuration */
export const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

export const etsyAuthUrl = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .usingStrings(...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<EtsyAuthUrlRequest, EtsyAuthUrlResponse>(
    async (data, _context, secrets, strings) => {
      const scopes = data.scopes ?? DEFAULT_SCOPES;

      // Create a temporary EtsyClient just for OAuth URL generation.
      // No token storage needed — we're only generating the auth URL.
      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: { getTokens: async () => null, saveTokens: async () => {} },
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      const { url, codeVerifier, state } = client.oauth.generateAuthUrl(scopes);

      // Store PKCE state for the callback to consume
      await saveOAuthState(state, codeVerifier);

      return { url, state };
    }
  );
