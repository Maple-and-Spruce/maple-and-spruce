/**
 * Get Sales Cloud Function
 *
 * Retrieves sales with optional filters.
 * Admin-only function.
 */
import { createAdminFunction } from '@maple/firebase/functions';
import { SaleRepository } from '@maple/firebase/database';
import type {
  GetSalesRequest,
  GetSalesResponse,
} from '@maple/ts/firebase/api-types';

export const getSales = createAdminFunction<
  GetSalesRequest,
  GetSalesResponse
>(async (data) => {
  const sales = await SaleRepository.findAll({
    artistId: data.artistId,
    source: data.source,
    dateFrom: data.from ? new Date(data.from) : undefined,
    dateTo: data.to ? new Date(data.to) : undefined,
  });

  return { sales };
});
