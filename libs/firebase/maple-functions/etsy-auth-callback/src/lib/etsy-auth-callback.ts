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
import { EtsyClient, fetchUserShopId } from '@maple/firebase/etsy';
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

      // Fetch the shop ID from Etsy. Non-fatal — if it fails here, the
      // settings page exposes a manual "Refresh shop ID" button that
      // re-runs this same call without forcing the admin to re-auth.
      const etsyApiBase =
        process.env['ETSY_API_BASE'] ?? 'https://api.etsy.com/v3/application';
      const shopResult = await fetchUserShopId({
        apiBase: etsyApiBase,
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        userId: tokenData.userId,
        accessToken: tokenData.accessToken,
      });

      if (shopResult.shopId) {
        await updateTokenShopId(shopResult.shopId);
      } else {
        console.warn(
          `Etsy shop ID fetch failed during OAuth callback (status=${shopResult.status}):`,
          shopResult.reason
        );
      }

      return {
        success: true,
        shopId: shopResult.shopId ?? undefined,
        userId: tokenData.userId,
      };
    }
  );
