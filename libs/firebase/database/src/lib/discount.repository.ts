/**
 * Discount Repository
 *
 * Handles all Firestore operations for discount codes.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Discount,
  CreateDiscountInput,
  UpdateDiscountInput,
  DiscountStatus,
} from '@maple/ts/domain';

const COLLECTION = 'discounts';

/**
 * Convert Firestore document to Discount
 */
function docToDiscount(
  doc: FirebaseFirestore.DocumentSnapshot
): Discount | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;

  const base = {
    id: doc.id,
    code: data.code,
    description: data.description,
    status: data.status as DiscountStatus,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };

  switch (data.type) {
    case 'percent':
      return {
        ...base,
        type: 'percent',
        percent: data.percent,
      };
    case 'amount':
      return {
        ...base,
        type: 'amount',
        amountCents: data.amountCents,
      };
    case 'amount-before-date':
      return {
        ...base,
        type: 'amount-before-date',
        amountCents: data.amountCents,
        cutoffDate: toDate(data.cutoffDate),
      };
    default:
      console.warn(`Unknown discount type: ${data.type} for doc ${doc.id}`);
      return undefined;
  }
}

/**
 * Filters for querying discounts
 */
export interface DiscountFilters {
  status?: DiscountStatus;
}

/**
 * Discount Repository - handles all Firestore operations for discounts
 */
export const DiscountRepository = {
  /**
   * Find all discounts with optional filters
   */
  async findAll(filters?: DiscountFilters): Promise<Discount[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('code', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToDiscount(doc))
      .filter((d): d is Discount => d !== undefined);
  },

  /**
   * Find a discount by ID
   */
  async findById(id: string): Promise<Discount | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToDiscount(doc);
  },

  /**
   * Find a discount by code (case-insensitive via uppercase storage)
   */
  async findByCode(code: string): Promise<Discount | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('code', '==', code.toUpperCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToDiscount(snapshot.docs[0]);
  },

  /**
   * Create a new discount
   */
  async create(input: CreateDiscountInput): Promise<Discount> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      // Always store code in uppercase for case-insensitive lookups
      code: input.code.toUpperCase(),
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    // Return the created discount using the same conversion logic
    const created = await docRef.get();
    const discount = docToDiscount(created);

    if (!discount) {
      throw new Error('Failed to create discount');
    }

    return discount;
  },

  /**
   * Update an existing discount
   */
  async update(input: UpdateDiscountInput): Promise<Discount> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    // Uppercase code if being updated
    if (updates.code) {
      dataWithTimestamp.code = updates.code.toUpperCase();
    }

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const discount = docToDiscount(updated);

    if (!discount) {
      throw new Error(`Discount ${id} not found after update`);
    }

    return discount;
  },

  /**
   * Delete a discount
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },
};
