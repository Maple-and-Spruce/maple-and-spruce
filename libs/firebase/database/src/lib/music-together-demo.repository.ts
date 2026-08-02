/**
 * Music Together Demo Repository
 *
 * Firestore operations for Music Together demo classes (free, dated,
 * capacity-gated try-a-class events). All database access goes through this
 * repository (deny-all rules; Admin SDK).
 *
 * `dateTime` is persisted as a real Date/Timestamp (not an ISO string) so the
 * `findUpcomingVisible` range query (`dateTime >= now`) compares like-typed
 * fields — a string field would silently never match a Timestamp bound.
 */
import { getDb, toDate } from './utilities/database.config';
import type {
  MusicTogetherDemo,
  CreateMusicTogetherDemoInput,
  UpdateMusicTogetherDemoInput,
} from '@maple/ts/domain';

const COLLECTION = 'musicTogetherDemos';

function docToDemo(
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherDemo | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    dateTime: toDate(data.dateTime),
    location: data.location,
    capacityFamilies: data.capacityFamilies,
    durationMinutes:
      typeof data.durationMinutes === 'number'
        ? data.durationMinutes
        : undefined,
    notes: data.notes ?? undefined,
    // Default false so any doc lacking the field reads as hidden.
    visible: data.visible ?? false,
    createdAt: toDate(data.createdAt),
    webflowItemId: data.webflowItemId ?? undefined,
  };
}

/**
 * Build the persisted payload. Coerce `dateTime` to a real Date so Firestore
 * stores a Timestamp (required for the range query). Optional fields are
 * clearable: persist `null` (not `undefined`) when absent so `update()`
 * actually removes a previously-set value.
 */
function toPersisted(
  input: CreateMusicTogetherDemoInput | Omit<UpdateMusicTogetherDemoInput, 'id'>
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...input };
  if (input.dateTime !== undefined) {
    data.dateTime = toDate(input.dateTime);
  }
  if ('durationMinutes' in input && !input.durationMinutes) {
    data.durationMinutes = null;
  }
  if ('notes' in input && !input.notes) {
    data.notes = null;
  }
  return data;
}

export const MusicTogetherDemoRepository = {
  async findAll(): Promise<MusicTogetherDemo[]> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .orderBy('dateTime', 'asc')
      .get();
    return snapshot.docs
      .map((doc) => docToDemo(doc))
      .filter((d): d is MusicTogetherDemo => d !== undefined);
  },

  /** Upcoming, publicly visible demos (dateTime >= now), soonest first. */
  async findUpcomingVisible(now: Date = new Date()): Promise<MusicTogetherDemo[]> {
    const snapshot = await getDb()
      .collection(COLLECTION)
      .where('visible', '==', true)
      .where('dateTime', '>=', now)
      .orderBy('dateTime', 'asc')
      .get();
    return snapshot.docs
      .map((doc) => docToDemo(doc))
      .filter((d): d is MusicTogetherDemo => d !== undefined);
  },

  async findById(id: string): Promise<MusicTogetherDemo | undefined> {
    const doc = await getDb().collection(COLLECTION).doc(id).get();
    return docToDemo(doc);
  },

  async create(input: CreateMusicTogetherDemoInput): Promise<MusicTogetherDemo> {
    const docRef = getDb().collection(COLLECTION).doc();
    const data = { ...toPersisted(input), createdAt: new Date() };
    await docRef.set(data);
    const created = await docRef.get();
    const demo = docToDemo(created);
    if (!demo) throw new Error(`Demo ${docRef.id} not found after create`);
    return demo;
  },

  async update(input: UpdateMusicTogetherDemoInput): Promise<MusicTogetherDemo> {
    const { id, ...updates } = input;
    const docRef = getDb().collection(COLLECTION).doc(id);
    await docRef.update(toPersisted(updates));
    const updated = await docRef.get();
    const demo = docToDemo(updated);
    if (!demo) throw new Error(`Demo ${id} not found after update`);
    return demo;
  },

  async delete(id: string): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).delete();
  },

  /**
   * Store the Webflow CMS item ID after a successful sync. Uses a bare
   * `.update()` with NO other fields so it does not re-trigger the
   * Firestore → Webflow sync (which would otherwise loop).
   */
  async updateWebflowItemId(id: string, webflowItemId: string): Promise<void> {
    await getDb().collection(COLLECTION).doc(id).update({ webflowItemId });
  },
};
