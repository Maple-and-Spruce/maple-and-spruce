/**
 * Gift card purchases (#300).
 *
 * One document per gift card bought on our own buy page, keyed by the Square
 * gift card id: `giftCardPurchases/{giftCardId}`. Square owns the balance and
 * the code; this keeps what Square cannot (who it was for, the message, and
 * for a class certificate, which class type it covers).
 *
 * Never store the full card code here.
 */
import { getDb, toDate } from './utilities/database.config';
import type { GiftCardPurchase } from '@maple/ts/domain';

const COLLECTION = 'giftCardPurchases';

function docToGiftCardPurchase(
  doc: FirebaseFirestore.DocumentSnapshot
): GiftCardPurchase | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    giftCardId: doc.id,
    last4: data.last4,
    kind: data.kind,
    valueCents: data.valueCents,
    classId: data.classId ?? undefined,
    classCategoryId: data.classCategoryId ?? undefined,
    className: data.className ?? undefined,
    buyerName: data.buyerName,
    buyerEmail: data.buyerEmail,
    recipientName: data.recipientName ?? undefined,
    recipientEmail: data.recipientEmail ?? undefined,
    message: data.message ?? undefined,
    deliverTo: data.deliverTo,
    squareOrderId: data.squareOrderId,
    squarePaymentId: data.squarePaymentId,
    createdAt: toDate(data.createdAt),
  };
}

/** Firestore rejects `undefined`, so optional fields are left out instead. */
function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}

export const GiftCardPurchaseRepository = {
  /**
   * Record a purchase. Uses `create`, so recording the same card twice fails
   * instead of overwriting the first record.
   */
  async create(
    input: Omit<GiftCardPurchase, 'createdAt'>
  ): Promise<GiftCardPurchase> {
    const createdAt = new Date();
    const { giftCardId, ...fields } = input;
    await getDb()
      .collection(COLLECTION)
      .doc(giftCardId)
      .create(withoutUndefined({ ...fields, createdAt }));
    return { ...input, createdAt };
  },

  async findByGiftCardId(
    giftCardId: string
  ): Promise<GiftCardPurchase | undefined> {
    const doc = await getDb().collection(COLLECTION).doc(giftCardId).get();
    return docToGiftCardPurchase(doc);
  },
};
