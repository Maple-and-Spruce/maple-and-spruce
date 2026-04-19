/**
 * EtsyImport repository
 *
 * Persists raw Etsy listing snapshots keyed by the Firestore Product ID.
 * One-to-one with Product: when a Product is imported from Etsy, we write
 * its snapshot here so the raw Etsy shape survives later edits on Etsy.
 */
import { db } from './utilities/database.config';
import type { EtsyImport, EtsyRawPayload } from '@maple/ts/domain';

const COLLECTION = 'etsy-imports';

function docToEtsyImport(
  doc: FirebaseFirestore.DocumentSnapshot
): EtsyImport | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    listingId: data.listingId,
    rawListing: data.rawListing,
    rawInventory: data.rawInventory,
    variantCount: data.variantCount ?? 1,
    importedBy: data.importedBy,
    importedAt: data.importedAt?.toDate() ?? new Date(),
  };
}

export interface CreateEtsyImportInput {
  productId: string;
  listingId: string;
  rawListing: EtsyRawPayload;
  rawInventory?: EtsyRawPayload;
  variantCount: number;
  importedBy: string;
}

export const EtsyImportRepository = {
  async findByProductId(productId: string): Promise<EtsyImport | undefined> {
    const doc = await db.collection(COLLECTION).doc(productId).get();
    return docToEtsyImport(doc);
  },

  async findByListingId(listingId: string): Promise<EtsyImport | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('listingId', '==', listingId)
      .limit(1)
      .get();
    if (snapshot.empty) return undefined;
    return docToEtsyImport(snapshot.docs[0]);
  },

  async findAll(): Promise<EtsyImport[]> {
    const snapshot = await db.collection(COLLECTION).get();
    return snapshot.docs
      .map((doc) => docToEtsyImport(doc))
      .filter((i): i is EtsyImport => i !== undefined);
  },

  async create(input: CreateEtsyImportInput): Promise<EtsyImport> {
    const now = new Date();
    const doc: Record<string, unknown> = {
      listingId: input.listingId,
      rawListing: input.rawListing,
      variantCount: input.variantCount,
      importedBy: input.importedBy,
      importedAt: now,
    };
    if (input.rawInventory !== undefined) {
      doc.rawInventory = input.rawInventory;
    }
    await db.collection(COLLECTION).doc(input.productId).set(doc);

    return {
      id: input.productId,
      listingId: input.listingId,
      rawListing: input.rawListing,
      rawInventory: input.rawInventory,
      variantCount: input.variantCount,
      importedBy: input.importedBy,
      importedAt: now,
    };
  },

  async delete(productId: string): Promise<void> {
    await db.collection(COLLECTION).doc(productId).delete();
  },
};
