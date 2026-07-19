/**
 * Update Lesson Rates Config Cloud Function (#629)
 *
 * Sets the admin-configured default private-pay lesson rates by length.
 * Drops non-positive / non-integer entries so a bad value never prices an
 * auto-invoice.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import { LessonRatesConfigRepository } from '@maple/firebase/database';
import { LESSON_LENGTHS } from '@maple/ts/domain';
import type { LessonRateByLength } from '@maple/ts/domain';
import type {
  UpdateLessonRatesConfigRequest,
  UpdateLessonRatesConfigResponse,
} from '@maple/ts/firebase/api-types';

export const updateLessonRatesConfig = createAdminFunction<
  UpdateLessonRatesConfigRequest,
  UpdateLessonRatesConfigResponse
>(async (data, context) => {
  if (!data.rateByLength || typeof data.rateByLength !== 'object') {
    throwInvalidArgument('rateByLength must be an object');
  }

  const cleaned: LessonRateByLength = {};
  for (const length of LESSON_LENGTHS) {
    const cents = data.rateByLength[length];
    if (typeof cents === 'number' && Number.isInteger(cents) && cents > 0) {
      cleaned[length] = cents;
    }
  }

  const config = await LessonRatesConfigRepository.setRateByLength(
    cleaned,
    context.uid
  );
  return { config };
});
