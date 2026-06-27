/**
 * Music Together Registration Repository
 *
 * Firestore operations for Music Together registrations (one document per
 * enrolled family). All access goes through this repository (deny-all rules).
 */
import { getDb, toDate } from './utilities/database.config';
import {
  MT_CAPACITY_STATUSES,
  type MusicTogetherRegistration,
  type MusicTogetherChild,
  type MusicTogetherPaymentPlan,
  type MusicTogetherRegistrationStatus,
  type CreateMusicTogetherRegistrationInput,
  type UpdateMusicTogetherRegistrationInput,
} from '@maple/ts/domain';

const COLLECTION = 'musicTogetherRegistrations';

function parseChildren(raw: unknown): MusicTogetherChild[] {
  if (!Array.isArray(raw)) return [];
  const out: MusicTogetherChild[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { name?: unknown; dob?: unknown };
    if (typeof e.name !== 'string' || e.dob === undefined || e.dob === null) {
      continue;
    }
    out.push({ name: e.name, dob: toDate(e.dob) });
  }
  return out;
}

function docToRegistration(
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherRegistration | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    sectionId: data.sectionId,
    parentNames: Array.isArray(data.parentNames) ? data.parentNames : [],
    children: parseChildren(data.children),
    email: data.email,
    phone: data.phone,
    address: data.address,
    paymentPlan: data.paymentPlan as MusicTogetherPaymentPlan,
    policiesAcceptedAt: toDate(data.policiesAcceptedAt),
    cardOnFileAuthAt: data.cardOnFileAuthAt
      ? toDate(data.cardOnFileAuthAt)
      : undefined,
    pricePaidCents: data.pricePaidCents,
    squareCustomerId: data.squareCustomerId,
    squareCardId: data.squareCardId,
    squarePaymentId: data.squarePaymentId,
    squareOrderId: data.squareOrderId,
    squareReceiptUrl: data.squareReceiptUrl,
    scheduledChargeCount: data.scheduledChargeCount,
    status: data.status as MusicTogetherRegistrationStatus,
    notes: data.notes,
    confirmationSentAt: data.confirmationSentAt
      ? toDate(data.confirmationSentAt)
      : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export interface MusicTogetherRegistrationFilters {
  sectionId?: string;
  email?: string;
  status?: MusicTogetherRegistrationStatus;
}

export const MusicTogetherRegistrationRepository = {
  async findAll(
    filters?: MusicTogetherRegistrationFilters
  ): Promise<MusicTogetherRegistration[]> {
    let query: FirebaseFirestore.Query = getDb().collection(COLLECTION);

    if (filters?.sectionId) {
      query = query.where('sectionId', '==', filters.sectionId);
    }
    if (filters?.email) {
      query = query.where('email', '==', filters.email);
    }
    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is MusicTogetherRegistration => r !== undefined);
  },

  async findById(id: string): Promise<MusicTogetherRegistration | undefined> {
    const doc = await getDb().collection(COLLECTION).doc(id).get();
    return docToRegistration(doc);
  },

  async findBySectionId(
    sectionId: string
  ): Promise<MusicTogetherRegistration[]> {
    return this.findAll({ sectionId });
  },

  /**
   * Count families holding a spot in a section (each registration is one
   * family). Defaults to pending + confirmed — the capacity-relevant states.
   */
  async countBySectionId(
    sectionId: string,
    statuses: readonly MusicTogetherRegistrationStatus[] = MT_CAPACITY_STATUSES
  ): Promise<number> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('sectionId', '==', sectionId)
      .where('status', 'in', statuses as MusicTogetherRegistrationStatus[])
      .get();
    return snapshot.size;
  },

  async create(
    input: CreateMusicTogetherRegistrationInput
  ): Promise<MusicTogetherRegistration> {
    const docRef = getDb().collection(COLLECTION).doc();
    const now = new Date();
    const data = { ...input, createdAt: now, updatedAt: now };
    await docRef.set(data);
    const created = await docRef.get();
    const registration = docToRegistration(created);
    if (!registration) {
      throw new Error(`Registration ${docRef.id} not found after create`);
    }
    return registration;
  },

  async update(
    input: UpdateMusicTogetherRegistrationInput
  ): Promise<MusicTogetherRegistration> {
    const { id, ...updates } = input;
    const docRef = getDb().collection(COLLECTION).doc(id);
    await docRef.update({ ...updates, updatedAt: new Date() });
    const updated = await docRef.get();
    const registration = docToRegistration(updated);
    if (!registration) {
      throw new Error(`Registration ${id} not found after update`);
    }
    return registration;
  },

  async delete(id: string): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).delete();
  },

  /** Collection reference (for transactions / the Week-5 charge query). */
  getCollectionRef() {
    return getDb().collection(COLLECTION);
  },

  /** Document reference (for transactions). */
  getDocRef(id?: string) {
    return id
      ? getDb().collection(COLLECTION).doc(id)
      : getDb().collection(COLLECTION).doc();
  },
};
