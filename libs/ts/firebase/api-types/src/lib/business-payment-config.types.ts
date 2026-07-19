/**
 * Business Payment Config API types (#631) — the studio Venmo handle.
 */
import type { BusinessPaymentConfig } from '@maple/ts/domain';

export interface GetBusinessPaymentConfigRequest {
  _?: never;
}

export interface GetBusinessPaymentConfigResponse {
  config: BusinessPaymentConfig;
}

export interface UpdateBusinessPaymentConfigRequest {
  /** Venmo username (with or without a leading @). Empty clears it. */
  venmoHandle?: string;
}

export interface UpdateBusinessPaymentConfigResponse {
  config: BusinessPaymentConfig;
}
