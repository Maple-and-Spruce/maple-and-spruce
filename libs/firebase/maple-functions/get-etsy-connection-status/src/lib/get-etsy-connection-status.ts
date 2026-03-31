/**
 * Get Etsy Connection Status Cloud Function
 *
 * Returns the current state of the Etsy OAuth connection:
 * whether tokens exist, if the access token is still valid,
 * and basic shop/user info.
 *
 * Admin only — connection status is an admin concern.
 */
import { Functions, Role } from '@maple/firebase/functions';
import { FirestoreTokenStorage } from '@maple/firebase/database';
import type {
  GetEtsyConnectionStatusRequest,
  GetEtsyConnectionStatusResponse,
} from '@maple/ts/firebase/api-types';

export const getEtsyConnectionStatus = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<GetEtsyConnectionStatusRequest, GetEtsyConnectionStatusResponse>(
    async () => {
      const tokens = await FirestoreTokenStorage.getTokens();

      if (!tokens) {
        return {
          connected: false,
          tokenValid: false,
        };
      }

      const tokenValid = Date.now() < tokens.expiresAt;

      return {
        connected: true,
        tokenValid,
        shopId: tokens.shopId || undefined,
        userId: tokens.userId || undefined,
        tokenExpiresAt: tokens.expiresAt,
      };
    }
  );
