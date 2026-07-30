/**
 * Music Together Demo RSVP Repository
 *
 * Stored as a subcollection of the demo
 * (`musicTogetherDemos/{demoId}/rsvps/{emailKey}`) so RSVPs scope per demo and
 * are cleaned up if the demo is deleted (mirrors the section waitlist).
 *
 * The doc id is the lowercased email, making RSVPs idempotent per demo. `add`
 * runs in a TRANSACTION that counts existing `confirmed` RSVPs and assigns
 * `confirmed` while under `capacityFamilies`, else `waitlisted` — overbooking-
 * safe. A repeat RSVP (same demo + email) preserves the family's existing
 * place and status. Entries are read back ORDERED by signup time.
 */
import { getDb, toDate } from './utilities/database.config';
import type {
  MusicTogetherDemoRsvp,
  MusicTogetherDemoRsvpStatus,
} from '@maple/ts/domain';

const PARENT_COLLECTION = 'musicTogetherDemos';
const SUBCOLLECTION = 'rsvps';

/** Lowercase + trim an email into an idempotent Firestore-safe document id. */
export function mtDemoRsvpEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function rsvpsRef(demoId: string): FirebaseFirestore.CollectionReference {
  return getDb()
    .collection(PARENT_COLLECTION)
    .doc(demoId)
    .collection(SUBCOLLECTION);
}

function docToEntry(
  demoId: string,
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherDemoRsvp | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    demoId,
    name: data.name,
    email: data.email,
    status: (data.status as MusicTogetherDemoRsvpStatus) ?? 'confirmed',
    createdAt: toDate(data.createdAt),
  };
}

export const MusicTogetherDemoRsvpRepository = {
  /**
   * Idempotent, capacity-gated RSVP inside a transaction.
   *
   * - Re-RSVP (same demo + email) → returns the existing entry unchanged
   *   (`created: false`), keeping its place and status.
   * - New RSVP → `confirmed` when the confirmed count is under
   *   `capacityFamilies`, otherwise `waitlisted`.
   */
  async add(input: {
    demoId: string;
    name: string;
    email: string;
    capacityFamilies: number;
  }): Promise<{ entry: MusicTogetherDemoRsvp; created: boolean }> {
    const db = getDb();
    const id = mtDemoRsvpEmailKey(input.email);
    const ref = rsvpsRef(input.demoId).doc(id);

    return db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists) {
        return { entry: docToEntry(input.demoId, existing)!, created: false };
      }

      // Count confirmed RSVPs for this demo to decide the new status. Read
      // inside the transaction so concurrent RSVPs can't both take the last seat.
      const confirmedSnap = await tx.get(
        rsvpsRef(input.demoId).where('status', '==', 'confirmed')
      );
      const status: MusicTogetherDemoRsvpStatus =
        confirmedSnap.size < input.capacityFamilies ? 'confirmed' : 'waitlisted';

      const name = input.name.trim();
      const email = input.email.trim();
      const createdAt = new Date();
      tx.set(ref, { name, email, status, createdAt });

      return {
        entry: { id, demoId: input.demoId, name, email, status, createdAt },
        created: true,
      };
    });
  },

  /** All RSVPs for a demo, ordered by signup time (ascending). */
  async findByDemoId(demoId: string): Promise<MusicTogetherDemoRsvp[]> {
    const snapshot = await rsvpsRef(demoId).orderBy('createdAt', 'asc').get();
    return snapshot.docs
      .map((doc) => docToEntry(demoId, doc))
      .filter((e): e is MusicTogetherDemoRsvp => e !== undefined);
  },

  /** Count RSVPs for a demo in a given status (confirmed / waitlisted). */
  async countByDemoIdAndStatus(
    demoId: string,
    status: MusicTogetherDemoRsvpStatus
  ): Promise<number> {
    const snapshot = await rsvpsRef(demoId)
      .where('status', '==', status)
      .count()
      .get();
    return snapshot.data().count;
  },
};
