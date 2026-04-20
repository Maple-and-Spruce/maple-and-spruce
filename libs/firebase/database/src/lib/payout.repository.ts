/**
 * Payout Repository
 *
 * Handles all Firestore operations for artist payout records.
 * Each payout aggregates sales for a period and tracks payment status.
 */
import { db, toDate } from './utilities/database.config';
import type { Payout, PayoutStatus } from '@maple/ts/domain';

const COLLECTION = 'payouts';

function docToPayout(
  doc: FirebaseFirestore.DocumentSnapshot
): Payout | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;

  return {
    id: doc.id,
    artistId: data.artistId,
    periodStart: toDate(data.periodStart),
    periodEnd: toDate(data.periodEnd),
    saleCount: data.saleCount,
    totalSales: data.totalSales,
    totalCommission: data.totalCommission,
    amountOwed: data.amountOwed,
    status: data.status,
    paidAt: data.paidAt ? toDate(data.paidAt) : undefined,
    paymentMethod: data.paymentMethod,
    paymentReference: data.paymentReference,
    notes: data.notes,
    saleIds: data.saleIds ?? [],
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export interface PayoutFilters {
  artistId?: string;
  status?: PayoutStatus;
  dateFrom?: Date;
  dateTo?: Date;
}

export type CreatePayoutInput = Omit<Payout, 'id' | 'createdAt' | 'updatedAt'>;

export const PayoutRepository = {
  async create(input: CreatePayoutInput): Promise<Payout> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      artistId: input.artistId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      saleCount: input.saleCount,
      totalSales: input.totalSales,
      totalCommission: input.totalCommission,
      amountOwed: input.amountOwed,
      status: input.status,
      paidAt: input.paidAt ?? null,
      paymentMethod: input.paymentMethod ?? null,
      paymentReference: input.paymentReference ?? null,
      notes: input.notes ?? null,
      saleIds: input.saleIds,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
  },

  async findById(id: string): Promise<Payout | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToPayout(doc);
  },

  async findAll(filters: PayoutFilters = {}): Promise<Payout[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters.artistId) {
      query = query.where('artistId', '==', filters.artistId);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.dateFrom) {
      query = query.where('periodStart', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('periodEnd', '<=', filters.dateTo);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToPayout(doc))
      .filter((p): p is Payout => p !== undefined);
  },

  async findByArtistId(artistId: string): Promise<Payout[]> {
    return this.findAll({ artistId });
  },

  async markAsPaid(
    id: string,
    paymentMethod: string,
    paymentReference?: string
  ): Promise<Payout> {
    const now = new Date();
    const docRef = db.collection(COLLECTION).doc(id);

    const updateData: Record<string, unknown> = {
      status: 'paid',
      paidAt: now,
      paymentMethod,
      updatedAt: now,
    };

    if (paymentReference !== undefined) {
      updateData.paymentReference = paymentReference;
    }

    await docRef.update(updateData);

    const updated = await docRef.get();
    const payout = docToPayout(updated);
    if (!payout) {
      throw new Error(`Payout ${id} not found after update`);
    }
    return payout;
  },
};
