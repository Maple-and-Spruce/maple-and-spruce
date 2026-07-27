/**
 * Music Together Demo RSVP Repository
 *
 * Stored in the flat collection `musicTogetherDemoRsvps`, keyed by the
 * lowercased/trimmed email so a family's RSVP is idempotent. Unlike the
 * waitlist, demo RSVPs are NOT section-scoped — they're free try-a-class
 * signups keyed to a human-readable slot label.
 *
 * A repeat RSVP with the same email UPDATES the chosen slot/name (so a family
 * can change their mind about which demo to attend) and reports `created:
 * false`. Entries are read back ORDERED by signup time.
 */
import { getDb, toDate } from './utilities/database.config';
import type {
  MusicTogetherDemoRsvp,
  CreateMusicTogetherDemoRsvpInput,
} from '@maple/ts/domain';

const COLLECTION = 'musicTogetherDemoRsvps';

/** Lowercase + trim an email into an idempotent Firestore-safe document id. */
export function mtDemoRsvpEmailKey(email: string): string {
  return email.trim().toLowerCase();
}

function collectionRef(): FirebaseFirestore.CollectionReference {
  return getDb().collection(COLLECTION);
}

function docToEntry(
  doc: FirebaseFirestore.DocumentSnapshot
): MusicTogetherDemoRsvp | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    demoSlot: data.demoSlot,
    name: data.name,
    email: data.email,
    createdAt: toDate(data.createdAt),
  };
}

export const MusicTogetherDemoRsvpRepository = {
  /**
   * Idempotent RSVP. If the email already exists, UPDATE its demoSlot/name
   * (keeping the original createdAt) and return `created: false`; otherwise
   * create a new entry stamped with `createdAt` and return `created: true`.
   */
  async add(
    input: CreateMusicTogetherDemoRsvpInput
  ): Promise<{ entry: MusicTogetherDemoRsvp; created: boolean }> {
    const id = mtDemoRsvpEmailKey(input.email);
    const ref = collectionRef().doc(id);
    const existing = await ref.get();

    const demoSlot = input.demoSlot.trim();
    const name = input.name.trim();
    const email = input.email.trim();

    if (existing.exists) {
      // Update the family's chosen slot + name; keep their original signup time.
      await ref.set({ demoSlot, name }, { merge: true });
      const prev = existing.data()!;
      return {
        entry: {
          id,
          demoSlot,
          name,
          email: prev.email ?? email,
          createdAt: toDate(prev.createdAt),
        },
        created: false,
      };
    }

    const createdAt = new Date();
    await ref.set({ demoSlot, name, email, createdAt });
    return {
      entry: { id, demoSlot, name, email, createdAt },
      created: true,
    };
  },

  /** All demo RSVPs, ordered by signup time (ascending). */
  async findAll(): Promise<MusicTogetherDemoRsvp[]> {
    const snapshot = await collectionRef().orderBy('createdAt', 'asc').get();
    return snapshot.docs
      .map((doc) => docToEntry(doc))
      .filter((e): e is MusicTogetherDemoRsvp => e !== undefined);
  },
};
