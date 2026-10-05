/**
 * Artist consignment payouts (legacy #313), served by the `payouts` router.
 *
 * A payout aggregates an artist's unpaid sales over a period. Generating one
 * writes it and stamps each sale with its id in a single transaction
 * (`PayoutRepository.generate`), so a sale can't be paid twice (ADR-034).
 */
import {
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  ArtistRepository,
  PayoutRepository,
  SaleRepository,
} from '@maple/firebase/database';
import type {
  GeneratePayoutRequest,
  GeneratePayoutResponse,
  GetPayoutsRequest,
  GetPayoutsResponse,
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse,
} from '@maple/ts/firebase/api-types';

const roundCents = (amount: number) => Math.round(amount * 100) / 100;

export async function getArtistPayouts(data: GetPayoutsRequest): Promise<GetPayoutsResponse> {
  const payouts = await PayoutRepository.findAll({
    artistId: data.artistId,
    status: data.status,
  });
  return { payouts };
}

export async function generateArtistPayout(
  data: GeneratePayoutRequest
): Promise<GeneratePayoutResponse> {
  if (!data.artistId) {
    throwInvalidArgument('Artist ID is required');
  }
  if (!data.periodStart || !data.periodEnd) {
    throwInvalidArgument('Period start and end are required');
  }

  const periodStart = new Date(data.periodStart);
  const periodEnd = new Date(data.periodEnd);

  if (!Number.isFinite(periodStart.getTime()) || !Number.isFinite(periodEnd.getTime())) {
    throwInvalidArgument('Invalid date format for period start or end');
  }
  if (periodEnd.getTime() <= periodStart.getTime()) {
    throwInvalidArgument('Period end must be after period start');
  }
  if (periodEnd.getTime() > Date.now()) {
    throwInvalidArgument('Period end cannot be in the future');
  }

  const artist = await ArtistRepository.findById(data.artistId);
  if (!artist) {
    throwInvalidArgument(`Artist not found: ${data.artistId}`);
  }

  const unpaidSales = await SaleRepository.findUnpaidByArtist(
    data.artistId,
    periodStart,
    periodEnd
  );
  if (unpaidSales.length === 0) {
    throwInvalidArgument('No unpaid sales found for this artist in the specified period');
  }

  const outcome = await PayoutRepository.generate({
    artistId: data.artistId,
    periodStart,
    periodEnd,
    saleCount: unpaidSales.length,
    totalSales: roundCents(unpaidSales.reduce((sum, s) => sum + s.salePrice, 0)),
    totalCommission: roundCents(unpaidSales.reduce((sum, s) => sum + s.commission, 0)),
    amountOwed: roundCents(unpaidSales.reduce((sum, s) => sum + s.artistEarnings, 0)),
    status: 'pending',
    saleIds: unpaidSales.map((s) => s.id),
  });

  if (outcome.kind === 'already-claimed') {
    throwFailedPrecondition(
      'Some of these sales were just put on another payout; refresh and try again'
    );
  }
  return { payout: outcome.payout };
}

export async function markArtistPayoutPaid(
  data: MarkPayoutPaidRequest
): Promise<MarkPayoutPaidResponse> {
  if (!data.payoutId) {
    throwInvalidArgument('Payout ID is required');
  }
  if (!data.paymentMethod) {
    throwInvalidArgument('Payment method is required');
  }

  const existing = await PayoutRepository.findById(data.payoutId);
  if (!existing) {
    throwNotFound('Payout', data.payoutId);
  }
  if (existing.status !== 'pending') {
    throwFailedPrecondition(`Payout is already marked as '${existing.status}'`);
  }

  const payout = await PayoutRepository.markAsPaid(
    data.payoutId,
    data.paymentMethod,
    data.paymentReference
  );
  return { payout };
}
