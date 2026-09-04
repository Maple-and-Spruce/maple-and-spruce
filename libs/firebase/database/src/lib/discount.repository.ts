/**
 * Discount Repository
 *
 * Handles all Firestore operations for discount codes.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import { LEGACY_DISCOUNT_PROGRAM } from '@maple/ts/domain';
import type {
  Discount,
  CreateDiscountInput,
  UpdateDiscountInput,
  DiscountStatus,
  DiscountAppliesTo,
  DiscountProgram,
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

  // Default appliesTo='order' / nthSlot=1 for documents written before
  // these fields existed — keeps legacy codes working without a migration.
  const appliesTo: DiscountAppliesTo =
    data.appliesTo === 'nth-slot-onward' ? 'nth-slot-onward' : 'order';

  // Usage tracking back-fill: legacy docs are unlimited (usageLimit=null)
  // with zero usages. expiresAt and generatedFromRegistrationId are optional.
  const usageLimit =
    typeof data.usageLimit === 'number' ? data.usageLimit : null;
  const usageCount =
    typeof data.usageCount === 'number' ? data.usageCount : 0;
  const expiresAt = data.expiresAt ? toDate(data.expiresAt) : undefined;
  const generatedFromRegistrationId =
    typeof data.generatedFromRegistrationId === 'string'
      ? data.generatedFromRegistrationId
      : undefined;

  // Program back-fill (#791). Every code written before scoping existed was
  // created for Maple & Spruce class checkout — Music Together had no discount
  // support at all — so LEGACY_DISCOUNT_PROGRAM is a statement of fact, not a
  // guess. Defaulting the other way would silently make old codes redeemable
  // against Stephanie's separate Square account.
  const program: DiscountProgram =
    data.program === 'music-together'
      ? 'music-together'
      : LEGACY_DISCOUNT_PROGRAM;

  const base = {
    id: doc.id,
    code: data.code,
    description: data.description,
    status: data.status as DiscountStatus,
    program,
    appliesTo,
    nthSlot: typeof data.nthSlot === 'number' ? data.nthSlot : 1,
    usageLimit,
    usageCount,
    ...(expiresAt ? { expiresAt } : {}),
    ...(generatedFromRegistrationId ? { generatedFromRegistrationId } : {}),
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
  /** Restrict to one program's codes (see `DiscountProgram`). */
  program?: DiscountProgram;
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
    const discounts = snapshot.docs
      .map((doc) => docToDiscount(doc))
      .filter((d): d is Discount => d !== undefined);

    // `program` is filtered HERE, not in the Firestore query, and that is
    // deliberate. A Firestore equality filter does not match documents that
    // lack the field, so `where('program','==','classes')` would silently drop
    // every code written before scoping existed (#791) — emptying the classes
    // Discounts page of all its real codes. The back-fill in `docToDiscount`
    // cannot rescue that: it runs on documents the query already returned.
    //
    // Filtering after the read applies the same back-fill the rest of the
    // codebase sees, so a legacy document is treated as the classes code it
    // is. `discounts` is an admin-authored collection of tens of codes, so
    // reading it whole costs nothing worth optimizing — and this stays correct
    // no matter how a document got written.
    return filters?.program
      ? discounts.filter((d) => d.program === filters.program)
      : discounts;
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputRecord = input as Record<string, any>;
    const data = {
      ...input,
      // Always store code in uppercase for case-insensitive lookups
      code: input.code.toUpperCase(),
      // Convert cutoffDate to Date if present (for amount-before-date discounts)
      ...(inputRecord.cutoffDate
        ? { cutoffDate: new Date(inputRecord.cutoffDate) }
        : {}),
      // Default usage tracking. usageLimit=null means unlimited; usageCount
      // starts at 0 and is incremented atomically by create-registration.
      usageLimit:
        inputRecord.usageLimit === undefined
          ? null
          : inputRecord.usageLimit,
      usageCount: 0,
      // Never let a code land unscoped: an absent program would read back as
      // `classes` via the legacy back-fill, which is the safe direction but
      // silently wrong for an MT code. Store it explicitly.
      program: input.program ?? LEGACY_DISCOUNT_PROGRAM,
      ...(inputRecord.expiresAt
        ? { expiresAt: new Date(inputRecord.expiresAt) }
        : {}),
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
      // Convert cutoffDate to Date if present
      ...(updates.cutoffDate
        ? { cutoffDate: new Date(updates.cutoffDate) }
        : {}),
      // Coerce expiresAt to Date when set, or clear it when explicitly null.
      ...(updates.expiresAt instanceof Date
        ? { expiresAt: updates.expiresAt }
        : updates.expiresAt
          ? { expiresAt: new Date(updates.expiresAt) }
          : {}),
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

  /**
   * Get a Firestore document reference for use inside a transaction.
   * Used by create-registration to atomically check + increment usageCount.
   */
  getDocRef(id: string) {
    return db.collection(COLLECTION).doc(id);
  },
};
