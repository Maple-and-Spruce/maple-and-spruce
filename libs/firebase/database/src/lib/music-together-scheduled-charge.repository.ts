/**
 * Music Together Scheduled Charge Repository
 *
 * Firestore operations for materialized future installment charges. The
 * auto-charge job (Phase 4) queries `findDue()`; cancellation flips a
 * registration's charges via `findByRegistrationId()`.
 */
import { getDb, toDate } from './utilities/database.config';
import {
  mtChargeIdempotencyKey,
  type MusicTogetherScheduledCharge,
  type MusicTogetherChargeStatus,
  type CreateMusicTogetherScheduledChargeInput,
  type UpdateMusicTogetherScheduledChargeInput,
} from '@maple/ts/domain';

const COLLECTION = 'musicTogetherScheduledCharges';

function docToCharge(
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherScheduledCharge | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    registrationId: data.registrationId,
    sectionId: data.sectionId,
    installmentNumber: data.installmentNumber,
    amountCents: data.amountCents,
    dueAt: toDate(data.dueAt),
    status: data.status as MusicTogetherChargeStatus,
    idempotencyKey: data.idempotencyKey,
    squarePaymentId: data.squarePaymentId,
    lastError: data.lastError,
    waivedReason: data.waivedReason,
    waivedByUid: data.waivedByUid,
    resolvedAt: data.resolvedAt ? toDate(data.resolvedAt) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export interface MusicTogetherScheduledChargeFilters {
  registrationId?: string;
  sectionId?: string;
  status?: MusicTogetherChargeStatus;
}

export const MusicTogetherScheduledChargeRepository = {
  async findAll(
    filters?: MusicTogetherScheduledChargeFilters
  ): Promise<MusicTogetherScheduledCharge[]> {
    let query: FirebaseFirestore.Query = getDb().collection(COLLECTION);

    if (filters?.registrationId) {
      query = query.where('registrationId', '==', filters.registrationId);
    }
    if (filters?.sectionId) {
      query = query.where('sectionId', '==', filters.sectionId);
    }
    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('dueAt', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToCharge(doc))
      .filter((c): c is MusicTogetherScheduledCharge => c !== undefined);
  },

  async findById(
    id: string
  ): Promise<MusicTogetherScheduledCharge | undefined> {
    const doc = await getDb().collection(COLLECTION).doc(id).get();
    return docToCharge(doc);
  },

  /** All charges for a registration (used by the cancel flow). */
  async findByRegistrationId(
    registrationId: string
  ): Promise<MusicTogetherScheduledCharge[]> {
    return this.findAll({ registrationId });
  },

  /**
   * Charges that are due to run: still `scheduled` with `dueAt <= asOf`.
   * This is the auto-charge job's primary query.
   */
  async findDue(asOf: Date): Promise<MusicTogetherScheduledCharge[]> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('status', '==', 'scheduled')
      .where('dueAt', '<=', asOf)
      .orderBy('dueAt', 'asc')
      .get();
    return snapshot.docs
      .map((doc) => docToCharge(doc))
      .filter((c): c is MusicTogetherScheduledCharge => c !== undefined);
  },

  async create(
    input: CreateMusicTogetherScheduledChargeInput
  ): Promise<MusicTogetherScheduledCharge> {
    const docRef = getDb().collection(COLLECTION).doc();
    const now = new Date();
    // Idempotency key derives from the (stable) doc id — never time-based.
    const data = {
      ...input,
      idempotencyKey: mtChargeIdempotencyKey(docRef.id),
      createdAt: now,
      updatedAt: now,
    };
    await docRef.set(data);
    const created = await docRef.get();
    const charge = docToCharge(created);
    if (!charge) {
      throw new Error(`Scheduled charge ${docRef.id} not found after create`);
    }
    return charge;
  },

  async update(
    input: UpdateMusicTogetherScheduledChargeInput
  ): Promise<MusicTogetherScheduledCharge> {
    const { id, ...updates } = input;
    const docRef = getDb().collection(COLLECTION).doc(id);
    await docRef.update({ ...updates, updatedAt: new Date() });
    const updated = await docRef.get();
    const charge = docToCharge(updated);
    if (!charge) {
      throw new Error(`Scheduled charge ${id} not found after update`);
    }
    return charge;
  },

  async delete(id: string): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).delete();
  },

  /**
   * Atomically claim a charge for processing by flipping `scheduled → charging`
   * in a transaction. Returns `true` if this caller won the lease, `false` if
   * the charge is already in flight or terminal (another run claimed it, or it
   * was cancelled). This is the overlap-prevention layer of the overcharge
   * safety model — a charge can only be claimed once.
   */
  async tryClaimLease(id: string): Promise<boolean> {
    const db = getDb();
    const docRef = db.collection(COLLECTION).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists || snap.data()?.status !== 'scheduled') {
        return false;
      }
      tx.update(docRef, { status: 'charging', updatedAt: new Date() });
      return true;
    });
  },

  /**
   * Atomically forgive a charge that has not been taken: `scheduled → waived`
   * in a transaction. Returns the waived charge, or `undefined` when the
   * charge is missing or no longer `scheduled` — a charge already `charging`,
   * `paid`, `failed`, or `cancelled` must not be silently rewritten, since the
   * money has either moved or the family has left.
   *
   * Mirrors `tryClaimLease`: the status check and the write share one
   * transaction, so this can never race the charge job into a double outcome.
   */
  async tryWaive(
    id: string,
    waivedReason: string,
    waivedByUid: string
  ): Promise<MusicTogetherScheduledCharge | undefined> {
    const db = getDb();
    const docRef = db.collection(COLLECTION).doc(id);
    const won = await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists || snap.data()?.status !== 'scheduled') {
        return false;
      }
      tx.update(docRef, {
        status: 'waived',
        waivedReason,
        waivedByUid,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      });
      return true;
    });
    if (!won) return undefined;
    return docToCharge(await docRef.get());
  },

  /** Document reference (for transactional lease claims in the charge job). */
  getDocRef(id?: string) {
    return id
      ? getDb().collection(COLLECTION).doc(id)
      : getDb().collection(COLLECTION).doc();
  },
};
