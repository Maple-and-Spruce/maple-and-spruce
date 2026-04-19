/**
 * Refresh Etsy Shop ID Cloud Function
 *
 * Retries the shop-ID resolution against the Etsy API using the already-
 * stored access token. Exists so admins who completed OAuth but whose
 * shop ID didn't land (historically due to unrecognized API response
 * shapes) can unblock themselves without re-authorizing.
 *
 * Admin only.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  FirestoreTokenStorage,
  updateTokenShopId,
} from '@maple/firebase/database';
import { fetchUserShopId } from '@maple/firebase/etsy';
import type {
  RefreshEtsyShopIdRequest,
  RefreshEtsyShopIdResponse,
} from '@maple/ts/firebase/api-types';

const ETSY_SECRET_NAMES = ['ETSY_API_KEY', 'ETSY_SHARED_SECRET'] as const;

export const refreshEtsyShopId = Functions.endpoint
  .usingSecrets(...ETSY_SECRET_NAMES)
  .requiringRole(Role.Admin)
  .handle<RefreshEtsyShopIdRequest, RefreshEtsyShopIdResponse>(
    async (_data, _context, secrets) => {
      const tokens = await FirestoreTokenStorage.getTokens();
      if (!tokens) {
        return {
          success: false,
          error:
            'Etsy is not connected — complete OAuth in Settings first.',
        };
      }
      if (!tokens.userId) {
        return {
          success: false,
          error:
            'Stored Etsy tokens are missing a user ID. Re-run the OAuth flow.',
        };
      }

      const apiBase =
        process.env['ETSY_API_BASE'] ?? 'https://api.etsy.com/v3/application';

      const result = await fetchUserShopId({
        apiBase,
        apiKey: secrets.ETSY_API_KEY,
        sharedSecret: secrets.ETSY_SHARED_SECRET,
        userId: tokens.userId,
        accessToken: tokens.accessToken,
      });

      if (!result.shopId) {
        return {
          success: false,
          status: result.status ?? undefined,
          error:
            result.reason ??
            'Etsy returned a response but no shop ID was resolvable.',
        };
      }

      await updateTokenShopId(result.shopId);
      return {
        success: true,
        shopId: result.shopId,
      };
    }
  );
