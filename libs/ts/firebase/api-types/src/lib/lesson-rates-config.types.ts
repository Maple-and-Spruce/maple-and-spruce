/**
 * Lesson Rates Config API request/response types (#629).
 *
 * Admin-configured default private-pay lesson rates by length, read by the
 * auto-invoice trigger.
 */
import type { LessonRateByLength, LessonRatesConfig } from '@maple/ts/domain';

export interface GetLessonRatesConfigRequest {
  _?: never;
}

export interface GetLessonRatesConfigResponse {
  config: LessonRatesConfig;
}

export interface UpdateLessonRatesConfigRequest {
  rateByLength: LessonRateByLength;
}

export interface UpdateLessonRatesConfigResponse {
  config: LessonRatesConfig;
}
