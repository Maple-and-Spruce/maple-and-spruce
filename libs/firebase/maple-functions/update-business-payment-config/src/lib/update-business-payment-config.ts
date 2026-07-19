/**
 * Update Business Payment Config Cloud Function (#631)
 *
 * Sets the studio Venmo handle (stored without a leading @). An empty value
 * clears it.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { BusinessPaymentConfigRepository } from '@maple/firebase/database';
import type {
  UpdateBusinessPaymentConfigRequest,
  UpdateBusinessPaymentConfigResponse,
} from '@maple/ts/firebase/api-types';

export const updateBusinessPaymentConfig = createAdminFunction<
  UpdateBusinessPaymentConfigRequest,
  UpdateBusinessPaymentConfigResponse
>(async (data, context) => {
  const raw = (data.venmoHandle ?? '').trim().replace(/^@/, '');
  if (raw && !/^[A-Za-z0-9_-]{5,30}$/.test(raw)) {
    throwInvalidArgument(
      'Venmo handle must be 5–30 characters (letters, numbers, hyphens, underscores)'
    );
  }
  const config = await BusinessPaymentConfigRepository.setVenmoHandle(
    raw || undefined,
    context.uid
  );
  return { config };
});
