/**
 * Etsy Auth Callback Cloud Function
 *
 * Exchanges an OAuth authorization code for access and refresh tokens.
 * Validates the CSRF state parameter, then fetches the shop ID from
 * the Etsy API and stores everything in Firestore.
 *
 * Admin only — only admins can complete the OAuth flow.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  FirestoreTokenStorage,
  consumeOAuthState,
  updateTokenShopId,
} from '@maple/firebase/database';
import { EtsyClient } from '@maple/firebase/etsy';
import type {
  EtsyAuthCallbackRequest,
  EtsyAuthCallbackResponse,
} from '@maple/ts/firebase/api-types';

/** Secret names for Etsy API credentials */
const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;

/** String param names for Etsy configuration */
const ETSY_STRING_NAMES = ['ETSY_REDIRECT_URI'] as const;

export const etsyAuthCallback = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .usingStrings(...ETSY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<EtsyAuthCallbackRequest, EtsyAuthCallbackResponse>(
    async (data, _context, secrets, strings) => {
      const { code, state } = data;

      if (!code || !state) {
        throw new Error('Missing required parameters: code and state');
      }

      // Validate state and retrieve code verifier
      const codeVerifier = await consumeOAuthState(state);
      if (!codeVerifier) {
        throw new Error(
          'Invalid or expired OAuth state. Please restart the authorization flow.'
        );
      }

      // Create EtsyClient with Firestore token storage
      const client = new EtsyClient({
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        tokenStorage: FirestoreTokenStorage,
        redirectUri: strings.ETSY_REDIRECT_URI,
      });

      // Exchange the authorization code for tokens
      const tokenData = await client.oauth.exchangeCode({
        code,
        codeVerifier,
      });

      // Fetch the shop ID from Etsy.
      // The token response includes the user ID but not the shop ID.
      // We need to call the API to get it.
      let shopId = '';
      try {
        const response = await fetch(
          `https://api.etsy.com/v3/application/users/${tokenData.userId}/shops`,
          {
            headers: {
              'x-api-key': `${secrets.ETSY_API_KEY}:${secrets.ETSY_SHARED_SECRET}`,
              Authorization: `Bearer ${tokenData.accessToken}`,
            },
          }
        );

        if (response.ok) {
          const shopData = await response.json();
          if (shopData.results?.length > 0) {
            shopId = String(shopData.results[0].shop_id);
            await updateTokenShopId(shopId);
          }
        }
      } catch (error) {
        // Non-fatal — shop ID can be set later
        console.warn('Failed to fetch shop ID from Etsy:', error);
      }

      return {
        success: true,
        shopId: shopId || undefined,
        userId: tokenData.userId,
      };
    }
  );
