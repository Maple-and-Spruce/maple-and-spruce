/**
 * EMA product repository (WV Hope Scholarship).
 *
 * The studio's approved EMA portal products and their prices, kept in step with
 * the portal by hand from the Hope Billing page. A handful of documents, read
 * whole, so no queries and no indexes.
 */
import { db, toDate } from './utilities/database.config';
import type { HopeProduct, SaveHopeProductInput } from '@maple/ts/domain';

const COLLECTION = 'hopeProducts';

function docToHopeProduct(
  doc: FirebaseFirestore.DocumentSnapshot
): HopeProduct | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    emaProductId: data.emaProductId,
    name: data.name,
    priceCents: data.priceCents,
    active: data.active !== false,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export const HopeProductRepository = {
  /** Every product, active or not, by name. */
  async findAll(): Promise<HopeProduct[]> {
    const snapshot = await db.collection(COLLECTION).get();
    return snapshot.docs
      .map(docToHopeProduct)
      .filter((p): p is HopeProduct => p !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async findById(id: string): Promise<HopeProduct | undefined> {
    return docToHopeProduct(await db.collection(COLLECTION).doc(id).get());
  },

  /** Add a product, or edit the one named by `input.id`. */
  async save(input: SaveHopeProductInput): Promise<HopeProduct> {
    const now = new Date();
    const fields = {
      emaProductId: input.emaProductId.trim(),
      name: input.name.trim(),
      priceCents: input.priceCents,
      active: input.active,
      updatedAt: now,
    };
    const ref = input.id
      ? db.collection(COLLECTION).doc(input.id)
      : db.collection(COLLECTION).doc();
    if (input.id) {
      await ref.update(fields);
    } else {
      await ref.set({ ...fields, createdAt: now });
    }
    const saved = docToHopeProduct(await ref.get());
    if (!saved) throw new Error('EMA product not found after save');
    return saved;
  },
};
