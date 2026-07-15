/**
 * Class Waitlist Repository
 *
 * Stored as a subcollection of the parent class
 * (`classes/{classId}/waitlist/{emailKey}`) so entries are auto-cleaned
 * if the class is deleted, and per-class queries scope naturally.
 *
 * The doc id is `emailKey(email)` — a lowercased, trimmed form of the
 * address. Re-signing up with the same email is a no-op overwrite.
 */
import { getDb, toDate } from './utilities/database.config';
import type { ClassWaitlistEntry } from '@maple/ts/domain';

const PARENT_COLLECTION = 'classes';
const SUBCOLLECTION = 'waitlist';

/**
 * Normalize an email into a Firestore-safe document id. Lowercased + trimmed
 * makes signups idempotent regardless of how the user typed their address.
 */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

function waitlistRef(
  classId: string
): FirebaseFirestore.CollectionReference {
  return getDb()
    .collection(PARENT_COLLECTION)
    .doc(classId)
    .collection(SUBCOLLECTION);
}

function docToEntry(
  classId: string,
  doc: FirebaseFirestore.DocumentSnapshot
): ClassWaitlistEntry | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    classId,
    email: data.email,
    createdAt: toDate(data.createdAt),
  };
}

export const ClassWaitlistRepository = {
  /**
   * Idempotent signup. If the email already exists, returns `created: false`
   * and preserves the original `createdAt`.
   */
  async add(input: {
    classId: string;
    email: string;
  }): Promise<{ entry: ClassWaitlistEntry; created: boolean }> {
    const id = emailKey(input.email);
    const ref = waitlistRef(input.classId).doc(id);
    const existing = await ref.get();
    if (existing.exists) {
      return { entry: docToEntry(input.classId, existing)!, created: false };
    }
    const createdAt = new Date();
    await ref.set({
      email: input.email.trim(),
      createdAt,
    });
    return {
      entry: {
        id,
        classId: input.classId,
        email: input.email.trim(),
        createdAt,
      },
      created: true,
    };
  },

  async findByClassId(classId: string): Promise<ClassWaitlistEntry[]> {
    const snapshot = await waitlistRef(classId).get();
    return snapshot.docs
      .map((doc) => docToEntry(classId, doc))
      .filter((e): e is ClassWaitlistEntry => e !== undefined);
  },

  async countByClassId(classId: string): Promise<number> {
    const snapshot = await waitlistRef(classId).count().get();
    return snapshot.data().count;
  },

  /**
   * Waitlist counts for every class in one pass, as a `classId -> count` map
   * (classes with no waitlist are simply absent). Powers the classes-list
   * "Waitlist" column so the admin doesn't have to open each roster.
   *
   * Uses a `waitlist` collection-group scan. The Music Together waitlist also
   * lives in a `waitlist` subcollection, so we must keep only entries whose
   * grandparent is the top-level `classes` collection — otherwise MT signups
   * would leak in under a sectionId masquerading as a classId.
   */
  async countsByClass(): Promise<Record<string, number>> {
    const snapshot = await getDb().collectionGroup(SUBCOLLECTION).get();
    const counts: Record<string, number> = {};
    for (const doc of snapshot.docs) {
      const parentClassDoc = doc.ref.parent.parent;
      // parentClassDoc.parent is the top-level collection the doc belongs to.
      if (!parentClassDoc || parentClassDoc.parent.id !== PARENT_COLLECTION) {
        continue;
      }
      counts[parentClassDoc.id] = (counts[parentClassDoc.id] ?? 0) + 1;
    }
    return counts;
  },

  /**
   * Delete every entry for a class. Used after a broadcast notification
   * fires so we don't re-email everyone on the next cancellation.
   */
  async clearByClassId(classId: string): Promise<void> {
    const snapshot = await waitlistRef(classId).get();
    if (snapshot.empty) return;
    const batch = getDb().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  },
};
