/**
 * Get Lesson Rates Config Cloud Function (#629)
 *
 * Returns the admin-configured default private-pay lesson rates by length.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { LessonRatesConfigRepository } from '@maple/firebase/database';
import type {
  GetLessonRatesConfigRequest,
  GetLessonRatesConfigResponse,
} from '@maple/ts/firebase/api-types';

export const getLessonRatesConfig = createAdminFunction<
  GetLessonRatesConfigRequest,
  GetLessonRatesConfigResponse
>(async () => {
  const config = await LessonRatesConfigRepository.get();
  return { config };
});
