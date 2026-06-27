/**
 * Music Together Section Repository
 *
 * Firestore operations for Music Together sections (one term of the program).
 * All database access goes through this repository (deny-all rules; Admin SDK).
 */
import { getDb, toDate } from './utilities/database.config';
import {
  mtSectionFirstSessionAt,
  type MusicTogetherSection,
  type MusicTogetherSession,
  type MusicTogetherInstallmentPlanItem,
  type MusicTogetherSectionStatus,
  type CreateMusicTogetherSectionInput,
  type UpdateMusicTogetherSectionInput,
} from '@maple/ts/domain';

const COLLECTION = 'musicTogetherSections';

function parseSessions(raw: unknown): MusicTogetherSession[] {
  if (!Array.isArray(raw)) return [];
  const out: MusicTogetherSession[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { dateTime?: unknown };
    if (e.dateTime === undefined || e.dateTime === null) continue;
    out.push({ dateTime: toDate(e.dateTime) });
  }
  return out;
}

function parseInstallmentPlan(
  raw: unknown
): MusicTogetherInstallmentPlanItem[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: MusicTogetherInstallmentPlanItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { amountCents?: unknown; dueAt?: unknown };
    if (typeof e.amountCents !== 'number' || e.dueAt === undefined || e.dueAt === null) {
      continue;
    }
    out.push({ amountCents: e.amountCents, dueAt: toDate(e.dueAt) });
  }
  return out.length > 0 ? out : undefined;
}

function docToSection(
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherSection | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    sessions: parseSessions(data.sessions),
    capacityFamilies: data.capacityFamilies,
    priceFullCents: data.priceFullCents,
    installmentPlan: parseInstallmentPlan(data.installmentPlan),
    status: data.status as MusicTogetherSectionStatus,
    location: data.location,
    room: data.room,
    webflowItemId: data.webflowItemId,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Build the persisted payload, denormalizing `firstSessionAt` as an indexed
 * sort key (mirrors class.repository — the field is write-only, not on the
 * domain interface).
 */
function toPersisted(
  input:
    | CreateMusicTogetherSectionInput
    | Omit<UpdateMusicTogetherSectionInput, 'id'>
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...input };
  if (input.sessions) {
    data.firstSessionAt = mtSectionFirstSessionAt({ sessions: input.sessions });
  }
  return data;
}

export interface MusicTogetherSectionFilters {
  status?: MusicTogetherSectionStatus;
}

export const MusicTogetherSectionRepository = {
  async findAll(
    filters?: MusicTogetherSectionFilters
  ): Promise<MusicTogetherSection[]> {
    let query: FirebaseFirestore.Query = getDb().collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('firstSessionAt', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToSection(doc))
      .filter((s): s is MusicTogetherSection => s !== undefined);
  },

  async findById(id: string): Promise<MusicTogetherSection | undefined> {
    const doc = await getDb().collection(COLLECTION).doc(id).get();
    return docToSection(doc);
  },

  async create(
    input: CreateMusicTogetherSectionInput
  ): Promise<MusicTogetherSection> {
    const docRef = getDb().collection(COLLECTION).doc();
    const now = new Date();
    const data = { ...toPersisted(input), createdAt: now, updatedAt: now };
    await docRef.set(data);
    const created = await docRef.get();
    const section = docToSection(created);
    if (!section) {
      throw new Error(`Section ${docRef.id} not found after create`);
    }
    return section;
  },

  async update(
    input: UpdateMusicTogetherSectionInput
  ): Promise<MusicTogetherSection> {
    const { id, ...updates } = input;
    const docRef = getDb().collection(COLLECTION).doc(id);
    await docRef.update({ ...toPersisted(updates), updatedAt: new Date() });
    const updated = await docRef.get();
    const section = docToSection(updated);
    if (!section) {
      throw new Error(`Section ${id} not found after update`);
    }
    return section;
  },

  async delete(id: string): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).delete();
  },

  /** Collection reference (for transactions). */
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
