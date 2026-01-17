/**
 * Artist Repository
 *
 * Handles all Firestore operations for artists.
 * All database access should go through this repository.
 */
import { db } from './utilities/database.config';
import type {
  Artist,
  CreateArtistInput,
  UpdateArtistInput,
  ArtistStatus,
} from '@maple/ts/domain';

const COLLECTION = 'artists';

/**
 * Convert Firestore document to Artist
 */
function docToArtist(
  doc: FirebaseFirestore.DocumentSnapshot
): Artist | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    defaultCommissionRate: data.defaultCommissionRate,
    status: data.status,
    notes: data.notes,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

/**
 * Artist Repository - handles all Firestore operations for artists
 */
export const ArtistRepository = {
  /**
   * Find all artists, optionally filtered by status
   */
  async findAll(filters?: { status?: ArtistStatus }): Promise<Artist[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('name', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToArtist(doc))
      .filter((a): a is Artist => a !== undefined);
  },

  /**
   * Find an artist by ID
   */
  async findById(id: string): Promise<Artist | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToArtist(doc);
  },

  /**
   * Find an artist by email
   */
  async findByEmail(email: string): Promise<Artist | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToArtist(snapshot.docs[0]);
  },

  /**
   * Create a new artist
   */
  async create(input: CreateArtistInput): Promise<Artist> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();

    const data = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...data,
    };
  },

  /**
   * Update an existing artist
   */
  async update(input: UpdateArtistInput): Promise<Artist> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const artist = docToArtist(updated);

    if (!artist) {
      throw new Error(`Artist ${id} not found after update`);
    }

    return artist;
  },

  /**
   * Delete an artist
   * Note: In production, prefer deactivating artists instead of deleting
   * to preserve historical records.
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Mark an artist as inactive
   */
  async deactivate(id: string): Promise<Artist> {
    return this.update({
      id,
      status: 'inactive',
    });
  },

  /**
   * Mark an artist as active
   */
  async activate(id: string): Promise<Artist> {
    return this.update({
      id,
      status: 'active',
    });
  },
};
