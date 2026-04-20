/**
 * Etsy Receipt Service
 *
 * Retrieves shop receipts (orders) from the Etsy API.
 * Used by the poll-etsy-orders function to detect new sales.
 *
 * @see https://developers.etsy.com/documentation/reference/#operation/getShopReceipts
 */
import type { EtsyHttp } from '../http/etsy-http.js';
import type { EtsyReceipt } from '../types/receipt.types.js';
import type { EtsyPaginatedResponse } from '../types/common.types.js';

export interface GetShopReceiptsOptions {
  /** Only return receipts created after this Unix timestamp */
  minCreated?: number;
  /** Maximum number of receipts to return (default 25, max 100) */
  limit?: number;
}

export class ReceiptService {
  constructor(private readonly http: EtsyHttp) {}

  /**
   * Get receipts (orders) for a shop.
   *
   * @param shopId - Etsy shop ID (numeric)
   * @param options - Optional filters
   * @returns Array of receipts
   */
  async getShopReceipts(
    shopId: number,
    options?: GetShopReceiptsOptions
  ): Promise<EtsyReceipt[]> {
    const params: Record<string, string> = {};

    if (options?.minCreated !== undefined) {
      params['min_created'] = String(options.minCreated);
    }
    if (options?.limit !== undefined) {
      params['limit'] = String(options.limit);
    }

    const response = await this.http.get<EtsyPaginatedResponse<EtsyReceipt>>(
      `/shops/${shopId}/receipts`,
      params
    );

    return response.results;
  }
}
