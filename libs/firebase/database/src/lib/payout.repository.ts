/**
 * Payout Repository
 *
 * Handles all Firestore operations for artist payout records.
 * Each payout aggregates sales for a period and tracks payment status.
 *
 * A sale is claimed by stamping its `payoutId`. `generate` does that and
 * writes the payout in one transaction, so a sale can never land on two
 * payouts, even when two admins press Generate at once (ADR-034).
 */
import { db, getDb, toDate } from './utilities/database.config';
import type { Payout, PayoutStatus } from '@maple/ts/domain';

const COLLECTION = 'payouts';
const SALES = 'sales';

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

export type GeneratePayoutOutcome =
  | { kind: 'created'; payout: Payout }
  /** Some of the sales were put on another payout (or deleted) since they were read. */
  | { kind: 'already-claimed'; saleIds: string[] };

function payoutData(input: CreatePayoutInput, now: Date) {
  return {
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
}

export const PayoutRepository = {
  async create(input: CreatePayoutInput): Promise<Payout> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    await docRef.set(payoutData(input, now));

    return {
      id: docRef.id,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
  },

  /**
   * Write the payout and stamp its sales with its id, atomically.
   *
   * Refuses when any sale already carries a `payoutId`, or no longer exists,
   * by the time the transaction reads it. The loser of a race sees the
   * winner's stamps and gets `already-claimed`.
   */
  async generate(input: CreatePayoutInput): Promise<GeneratePayoutOutcome> {
    const database = getDb();
    const payoutRef = database.collection(COLLECTION).doc();
    const saleRefs = input.saleIds.map((id) => database.collection(SALES).doc(id));
    const now = new Date();

    const taken = await database.runTransaction(async (tx) => {
      const sales = saleRefs.length > 0 ? await tx.getAll(...saleRefs) : [];
      const claimed = sales
        .filter((sale) => !sale.exists || sale.data()?.['payoutId'])
        .map((sale) => sale.id);
      if (claimed.length > 0) return claimed;

      tx.create(payoutRef, payoutData(input, now));
      for (const ref of saleRefs) tx.update(ref, { payoutId: payoutRef.id });
      return [];
    });

    if (taken.length > 0) return { kind: 'already-claimed', saleIds: taken };
    return {
      kind: 'created',
      payout: { id: payoutRef.id, ...input, createdAt: now, updatedAt: now },
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
