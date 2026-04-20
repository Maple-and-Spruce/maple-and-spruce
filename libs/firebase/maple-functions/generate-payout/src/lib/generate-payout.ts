/**
 * Generate Payout Cloud Function (#313)
 *
 * Admin callable. Aggregates unpaid sales for an artist over a date range,
 * creates a Payout record, and marks each included Sale with the payoutId.
 */
import {
  createAdminFunction,
  throwInvalidArgument,
} from '@maple/firebase/functions';
import {
  SaleRepository,
  PayoutRepository,
  ArtistRepository,
} from '@maple/firebase/database';
import type {
  GeneratePayoutRequest,
  GeneratePayoutResponse,
} from '@maple/ts/firebase/api-types';

export const generatePayout = createAdminFunction<
  GeneratePayoutRequest,
  GeneratePayoutResponse
>(async (data) => {
  // --- Validate input ---
  if (!data.artistId) {
    throwInvalidArgument('Artist ID is required');
  }
  if (!data.periodStart || !data.periodEnd) {
    throwInvalidArgument('Period start and end are required');
  }

  const periodStart = new Date(data.periodStart);
  const periodEnd = new Date(data.periodEnd);

  if (
    !Number.isFinite(periodStart.getTime()) ||
    !Number.isFinite(periodEnd.getTime())
  ) {
    throwInvalidArgument('Invalid date format for period start or end');
  }

  if (periodEnd.getTime() <= periodStart.getTime()) {
    throwInvalidArgument('Period end must be after period start');
  }

  if (periodEnd.getTime() > Date.now()) {
    throwInvalidArgument('Period end cannot be in the future');
  }

  // Verify artist exists
  const artist = await ArtistRepository.findById(data.artistId);
  if (!artist) {
    throwInvalidArgument(`Artist not found: ${data.artistId}`);
  }

  // --- Gather unpaid sales ---
  const unpaidSales = await SaleRepository.findUnpaidByArtist(
    data.artistId,
    periodStart,
    periodEnd
  );

  if (unpaidSales.length === 0) {
    throwInvalidArgument(
      'No unpaid sales found for this artist in the specified period'
    );
  }

  // --- Aggregate ---
  const totalSales = unpaidSales.reduce((sum, s) => sum + s.salePrice, 0);
  const totalCommission = unpaidSales.reduce(
    (sum, s) => sum + s.commission,
    0
  );
  const amountOwed = unpaidSales.reduce(
    (sum, s) => sum + s.artistEarnings,
    0
  );
  const saleIds = unpaidSales.map((s) => s.id);

  // --- Create payout record ---
  const payout = await PayoutRepository.create({
    artistId: data.artistId,
    periodStart,
    periodEnd,
    saleCount: unpaidSales.length,
    totalSales: Math.round(totalSales * 100) / 100,
    totalCommission: Math.round(totalCommission * 100) / 100,
    amountOwed: Math.round(amountOwed * 100) / 100,
    status: 'pending',
    saleIds,
  });

  // --- Mark each sale with the payout ID ---
  await Promise.all(
    saleIds.map((saleId) => SaleRepository.updatePayoutId(saleId, payout.id))
  );

  return { payout };
});
