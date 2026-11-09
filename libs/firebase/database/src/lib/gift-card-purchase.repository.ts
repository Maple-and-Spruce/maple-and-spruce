/**
 * Gift card purchases (#300).
 *
 * One document per gift card we know more about than Square does, keyed by
 * the Square gift card id: `giftCardPurchases/{giftCardId}`. Written when a
 * card is bought on our own buy page (#300), when Katie marks a register card
 * as a class certificate, when the studio gives a free card (#310), or when
 * Katie prints a batch of certificates (#314), or when she replaces a lost card
 * (#332).
 * Square owns the balance and the code; this keeps what Square cannot (who it
 * was for, the message, for a class certificate which class type it covers,
 * and how it came about).
 *
 * Never store the full card code here.
 */
import { getDb, toDate } from './utilities/database.config';
import type {
  GiftCardPurchase,
  GiftCardPurchaseSource,
} from '@maple/ts/domain';

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
    source: data.source ?? undefined,
    classId: data.classId ?? undefined,
    classCategoryId: data.classCategoryId ?? undefined,
    className: data.className ?? undefined,
    buyerName: data.buyerName ?? undefined,
    buyerEmail: data.buyerEmail ?? undefined,
    recipientName: data.recipientName ?? undefined,
    recipientEmail: data.recipientEmail ?? undefined,
    fromName: data.fromName ?? undefined,
    message: data.message ?? undefined,
    deliverTo: data.deliverTo ?? undefined,
    squareOrderId: data.squareOrderId ?? undefined,
    squarePaymentId: data.squarePaymentId ?? undefined,
    reason: data.reason ?? undefined,
    recordedByUid: data.recordedByUid ?? undefined,
    batchId: data.batchId ?? undefined,
    batchIndex: data.batchIndex ?? undefined,
    design: data.design ?? undefined,
    replacesGiftCardId: data.replacesGiftCardId ?? undefined,
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
   * Record a card. Uses `create`, so recording the same card twice fails
   * (`isAlreadyExists`) instead of overwriting the first record.
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

  /**
   * Every record from the given sources, in one query (a single-field `in`
   * filter, so no composite index). The Gift Cards page reads free cards and
   * printed stock this way to split its totals (#314).
   */
  async findBySources(
    sources: readonly GiftCardPurchaseSource[]
  ): Promise<GiftCardPurchase[]> {
    if (sources.length === 0) return [];
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('source', 'in', [...sources])
      .get();
    return snapshot.docs
      .map(docToGiftCardPurchase)
      .filter((p): p is GiftCardPurchase => p !== undefined);
  },

  /** Every certificate printed in one batch, in batch order (#314). */
  async findByBatchId(batchId: string): Promise<GiftCardPurchase[]> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('batchId', '==', batchId)
      .get();
    return snapshot.docs
      .map(docToGiftCardPurchase)
      .filter((p): p is GiftCardPurchase => p !== undefined)
      .sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
  },

  /**
   * The card that replaced a lost one (#332), if it was replaced. A
   * single-field filter, so no composite index. There is at most one: a
   * replacement is resumed, never started twice, for the same lost card.
   */
  async findByReplacesGiftCardId(
    giftCardId: string
  ): Promise<GiftCardPurchase | undefined> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('replacesGiftCardId', '==', giftCardId)
      .limit(1)
      .get();
    return snapshot.docs.length > 0 ? docToGiftCardPurchase(snapshot.docs[0]) : undefined;
  },
};
