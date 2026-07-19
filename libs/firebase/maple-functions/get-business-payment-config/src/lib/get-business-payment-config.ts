/**
 * Get Business Payment Config Cloud Function (#631)
 *
 * Returns the studio Venmo handle for the admin Settings card. (Teachers get
 * the handle via getMyDayLessons, so this stays admin-only.)
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { BusinessPaymentConfigRepository } from '@maple/firebase/database';
import type {
  GetBusinessPaymentConfigRequest,
  GetBusinessPaymentConfigResponse,
} from '@maple/ts/firebase/api-types';

export const getBusinessPaymentConfig = createAdminFunction<
  GetBusinessPaymentConfigRequest,
  GetBusinessPaymentConfigResponse
>(async () => {
  const config = await BusinessPaymentConfigRepository.get();
  return { config };
});
