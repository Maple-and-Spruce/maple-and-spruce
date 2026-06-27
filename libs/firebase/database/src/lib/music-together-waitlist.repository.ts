/**
 * Music Together Waitlist Repository
 *
 * Stored as a subcollection of the section
 * (`musicTogetherSections/{sectionId}/waitlist/{emailKey}`) so entries scope
 * per section and are cleaned up if the section is deleted.
 *
 * The doc id is the lowercased email, making signups idempotent. Entries are
 * read back ORDERED by signup time so admins can make offers in turn.
 */
import { getDb, toDate } from './utilities/database.config';
import type { MusicTogetherWaitlistEntry } from '@maple/ts/domain';

const PARENT_COLLECTION = 'musicTogetherSections';
const SUBCOLLECTION = 'waitlist';

/** Lowercase + trim an email into an idempotent Firestore-safe document id. */
export function mtWaitlistEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function waitlistRef(
  sectionId: string
): FirebaseFirestore.CollectionReference {
  return getDb()
    .collection(PARENT_COLLECTION)
    .doc(sectionId)
    .collection(SUBCOLLECTION);
}

function docToEntry(
  sectionId: string,
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherWaitlistEntry | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    sectionId,
    name: data.name,
    email: data.email,
    availability: data.availability,
    createdAt: toDate(data.createdAt),
  };
}

export const MusicTogetherWaitlistRepository = {
  /**
   * Idempotent signup. If the email already exists, returns `created: false`
   * and preserves the original entry (including its place in line).
   */
  async add(input: {
    sectionId: string;
    name: string;
    email: string;
    availability?: string;
  }): Promise<{ entry: MusicTogetherWaitlistEntry; created: boolean }> {
    const id = mtWaitlistEmailKey(input.email);
    const ref = waitlistRef(input.sectionId).doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      return { entry: docToEntry(input.sectionId, existing)!, created: false };
    }
    const createdAt = new Date();
    const entry = {
      name: input.name.trim(),
      email: input.email.trim(),
      availability: input.availability?.trim() || null,
      createdAt,
    };
    await ref.set(entry);
    return {
      entry: {
        id,
        sectionId: input.sectionId,
        name: entry.name,
        email: entry.email,
        availability: entry.availability ?? undefined,
        createdAt,
      },
      created: true,
    };
  },

  /** All entries for a section, ordered by signup time (offer order). */
  async findBySectionId(
    sectionId: string
  ): Promise<MusicTogetherWaitlistEntry[]> {
    const snapshot = await waitlistRef(sectionId)
      .orderBy('createdAt', 'asc')
      .get();
    return snapshot.docs
      .map((doc) => docToEntry(sectionId, doc))
      .filter((e): e is MusicTogetherWaitlistEntry => e !== undefined);
  },

  async countBySectionId(sectionId: string): Promise<number> {
    const snapshot = await waitlistRef(sectionId).count().get();
    return snapshot.data().count;
  },

  /** Remove a single entry (e.g. once a family is offered and accepts a spot). */
  async removeByEmail(sectionId: string, email: string): Promise<void> {
    await waitlistRef(sectionId).doc(mtWaitlistEmailKey(email)).delete();
  },
};
