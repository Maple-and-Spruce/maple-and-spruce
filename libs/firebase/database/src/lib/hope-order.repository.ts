/**
 * EMA order repository (WV Hope Scholarship).
 *
 * Orders a Hope family has placed in the EMA portal, a block of lessons at a
 * time. Read per student (a single equality filter, so no composite index) or
 * whole for the Hope Billing page.
 */
import { db, toDate } from './utilities/database.config';
import type { HopeOrder } from '@maple/ts/domain';

const COLLECTION = 'hopeOrders';

function docToHopeOrder(
  doc: FirebaseFirestore.DocumentSnapshot
): HopeOrder | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    studentId: data.studentId,
    productId: data.productId,
    priceCents: data.priceCents,
    lessonCount: data.lessonCount,
    emaOrderId: data.emaOrderId ?? undefined,
    orderedOn: toDate(data.orderedOn),
    notes: data.notes ?? undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export const HopeOrderRepository = {
  /** Every order, or one student's, oldest first. */
  async findAll(filters: { studentId?: string } = {}): Promise<HopeOrder[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);
    if (filters.studentId) {
      query = query.where('studentId', '==', filters.studentId);
    }
    const snapshot = await query.get();
    return snapshot.docs
      .map(docToHopeOrder)
      .filter((o): o is HopeOrder => o !== undefined)
      .sort((a, b) => a.orderedOn.getTime() - b.orderedOn.getTime());
  },

  async findById(id: string): Promise<HopeOrder | undefined> {
    return docToHopeOrder(await db.collection(COLLECTION).doc(id).get());
  },

  /** Add an order, or edit the one named by `input.id`. */
  async save(
    input: Omit<HopeOrder, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ): Promise<HopeOrder> {
    const now = new Date();
    const fields: Record<string, unknown> = {
      studentId: input.studentId,
      productId: input.productId,
      priceCents: input.priceCents,
      lessonCount: input.lessonCount,
      orderedOn: input.orderedOn,
      // Firestore rejects undefined; an absent id or note is stored as null.
      emaOrderId: input.emaOrderId?.trim() || null,
      notes: input.notes?.trim() || null,
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
    const saved = docToHopeOrder(await ref.get());
    if (!saved) throw new Error('EMA order not found after save');
    return saved;
  },
};
