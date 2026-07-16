/**
 * Music Together Interest Repository
 *
 * Top-level collection `musicTogetherInterest/{emailKey}` — one doc per family,
 * keyed by lowercased email so signups are idempotent. Unlike the per-section
 * waitlist subcollection, an interest entry is cross-section: it carries a list
 * of `interestedSectionIds` and three preference free-text fields, and the
 * admin demand view scans the whole collection.
 *
 * Re-submitting with the same email UPDATES the entry (families refine which
 * sections they'd take and their notes) while preserving the original
 * `createdAt`.
 */
import { getDb, toDate } from './utilities/database.config';
import type {
  MusicTogetherInterest,
  CreateMusicTogetherInterestInput,
} from '@maple/ts/domain';

const COLLECTION = 'musicTogetherInterest';

/** Lowercase + trim an email into an idempotent Firestore-safe document id. */
export function mtInterestEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function interestRef(): FirebaseFirestore.CollectionReference {
  return getDb().collection(COLLECTION);
}

function docToInterest(
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherInterest | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    email: data.email,
    interestedSectionIds: Array.isArray(data.interestedSectionIds)
      ? data.interestedSectionIds
      : [],
    preferenceNote: data.preferenceNote ?? undefined,
    alternateTimesNote: data.alternateTimesNote ?? undefined,
    notes: data.notes ?? undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export const MusicTogetherInterestRepository = {
  /**
   * Idempotent upsert keyed by email. On a repeat email the entry is updated
   * with the latest selections/notes and `created: false` is returned; the
   * original `createdAt` is preserved.
   */
  async upsert(input: CreateMusicTogetherInterestInput): Promise<{
    entry: MusicTogetherInterest;
    created: boolean;
  }> {
    const id = mtInterestEmailKey(input.email);
    const ref = interestRef().doc(id);
    const existing = await ref.get();
    const now = new Date();
    const createdAt = existing.exists
      ? toDate(existing.data()!.createdAt)
      : now;

    const payload = {
      name: input.name.trim(),
      email: input.email.trim(),
      interestedSectionIds: input.interestedSectionIds ?? [],
      preferenceNote: input.preferenceNote?.trim() || null,
      alternateTimesNote: input.alternateTimesNote?.trim() || null,
      notes: input.notes?.trim() || null,
      createdAt,
      updatedAt: now,
    };
    await ref.set(payload);

    return {
      entry: {
        id,
        name: payload.name,
        email: payload.email,
        interestedSectionIds: payload.interestedSectionIds,
        preferenceNote: payload.preferenceNote ?? undefined,
        alternateTimesNote: payload.alternateTimesNote ?? undefined,
        notes: payload.notes ?? undefined,
        createdAt,
        updatedAt: now,
      },
      created: !existing.exists,
    };
  },

  /** All interest entries, most recent signup first. */
  async findAll(): Promise<MusicTogetherInterest[]> {
    const snapshot = await interestRef().orderBy('createdAt', 'desc').get();
    return snapshot.docs
      .map((doc) => docToInterest(doc))
      .filter((e): e is MusicTogetherInterest => e !== undefined);
  },

  async count(): Promise<number> {
    const snapshot = await interestRef().count().get();
    return snapshot.data().count;
  },

  /** Remove an entry (e.g. once the family enrolls). */
  async removeByEmail(email: string): Promise<void> {
    await interestRef().doc(mtInterestEmailKey(email)).delete();
  },
};
