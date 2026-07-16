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
    adultFirstName: data.adultFirstName ?? '',
    adultLastName: data.adultLastName ?? '',
    parentNames: Array.isArray(data.parentNames) ? data.parentNames : [],
    children: parseChildren(data.children),
    email: data.email,
    phone: data.phone,
    address: data.address,
    accommodations: data.accommodations ?? undefined,
    paymentPlan: data.paymentPlan as MusicTogetherPaymentPlan,
    policiesAcceptedAt: toDate(data.policiesAcceptedAt),
    privacyConsentAcceptedAt: data.privacyConsentAcceptedAt
      ? toDate(data.privacyConsentAcceptedAt)
      : undefined,
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
    calendarToken: data.calendarToken ?? undefined,
    reminderSentForSessions: parseReminderMap(data.reminderSentForSessions),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function parseReminderMap(raw: unknown): Record<string, Date> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, Date> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    out[key] = toDate(value);
  }
  return Object.keys(out).length > 0 ? out : undefined;
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

  /**
   * All registrations sharing a family calendar token. Single-field filter
   * (auto-indexed) — the per-family calendar feed resolves the token to the
   * family's sections. Unknown tokens simply return an empty list.
   */
  async findByCalendarToken(
    token: string
  ): Promise<MusicTogetherRegistration[]> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('calendarToken', '==', token)
      .get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is MusicTogetherRegistration => r !== undefined);
  },

  /**
   * The existing family calendar token for an email, if any prior registration
   * has one. Lets a returning family reuse a single subscribe link across
   * sections instead of minting a new token per registration.
   */
  async findCalendarTokenByEmail(email: string): Promise<string | undefined> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('email', '==', email)
      .get();
    for (const doc of snapshot.docs) {
      const token = doc.data().calendarToken;
      if (typeof token === 'string' && token.length > 0) return token;
    }
    return undefined;
  },

  /**
   * Mark a day-of reminder as sent for one session (keyed by the session's ISO
   * `dateTime`), making the reminder job idempotent across reruns.
   */
  async markReminderSentForSession(
    id: string,
    sessionIso: string,
    at: Date = new Date()
  ): Promise<void> {
    await getDb()
      .collection(COLLECTION)
      .doc(id)
      .update({
        [`reminderSentForSessions.${sessionIso}`]: at,
        updatedAt: new Date(),
      });
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
