/**
 * Sale Repository
 *
 * Handles all Firestore operations for sales records.
 * Each sale tracks commission split between store and artist.
 */
import { db, toDate } from './utilities/database.config';
import type { Sale, CreateSaleInput, SaleSource } from '@maple/ts/domain';

const COLLECTION = 'sales';

function docToSale(
  doc: FirebaseFirestore.DocumentSnapshot
): Sale | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;

  return {
    id: doc.id,
    productId: data.productId,
    variantId: data.variantId,
    artistId: data.artistId,
    salePrice: data.salePrice,
    quantitySold: data.quantitySold,
    commission: data.commission,
    artistEarnings: data.artistEarnings,
    commissionRateApplied: data.commissionRateApplied,
    source: data.source,
    squareOrderId: data.squareOrderId,
    squarePaymentId: data.squarePaymentId,
    etsyOrderId: data.etsyOrderId,
    etsyReceiptId: data.etsyReceiptId,
    soldAt: toDate(data.soldAt),
    createdAt: toDate(data.createdAt),
    payoutId: data.payoutId,
  };
}

export interface SaleFilters {
  artistId?: string;
  source?: SaleSource;
  productId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export const SaleRepository = {
  async create(input: CreateSaleInput): Promise<Sale> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      productId: input.productId,
      variantId: input.variantId,
      artistId: input.artistId,
      salePrice: input.salePrice,
      quantitySold: input.quantitySold,
      commission: input.commission,
      artistEarnings: input.artistEarnings,
      commissionRateApplied: input.commissionRateApplied,
      source: input.source,
      squareOrderId: input.squareOrderId,
      squarePaymentId: input.squarePaymentId,
      etsyOrderId: input.etsyOrderId,
      etsyReceiptId: input.etsyReceiptId,
      soldAt: input.soldAt,
      createdAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
      createdAt: now,
    };
  },

  async findById(id: string): Promise<Sale | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToSale(doc);
  },

  async findAll(filters: SaleFilters = {}): Promise<Sale[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters.artistId) {
      query = query.where('artistId', '==', filters.artistId);
    }
    if (filters.source) {
      query = query.where('source', '==', filters.source);
    }
    if (filters.productId) {
      query = query.where('productId', '==', filters.productId);
    }
    if (filters.dateFrom) {
      query = query.where('soldAt', '>=', filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.where('soldAt', '<=', filters.dateTo);
    }

    query = query.orderBy('soldAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToSale(doc))
      .filter((s): s is Sale => s !== undefined);
  },

  async findBySquareOrderId(
    squareOrderId: string
  ): Promise<Sale | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('squareOrderId', '==', squareOrderId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToSale(snapshot.docs[0]);
  },

  async updatePayoutId(saleId: string, payoutId: string): Promise<void> {
    await db.collection(COLLECTION).doc(saleId).update({ payoutId });
  },

  async findUnpaidByArtist(
    artistId: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<Sale[]> {
    // Firestore doesn't support "field is null" queries well,
    // so we fetch all sales for the artist in range and filter in memory.
    const sales = await this.findAll({ artistId, dateFrom, dateTo });
    return sales.filter((s) => !s.payoutId);
  },

  async findByEtsyReceiptId(
    etsyReceiptId: string
  ): Promise<Sale | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('etsyReceiptId', '==', etsyReceiptId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToSale(snapshot.docs[0]);
  },
};
