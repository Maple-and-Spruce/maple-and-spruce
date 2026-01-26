/**
 * Instructor Repository
 *
 * Handles all Firestore operations for instructors.
 * All database access should go through this repository.
 */
import { db } from './utilities/database.config';
import type {
  Instructor,
  CreateInstructorInput,
  UpdateInstructorInput,
  PayeeStatus,
} from '@maple/ts/domain';

const COLLECTION = 'instructors';

/**
 * Convert Firestore document to Instructor
 */
function docToInstructor(
  doc: FirebaseFirestore.DocumentSnapshot
): Instructor | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    photoUrl: data.photoUrl,
    status: data.status,
    notes: data.notes,
    payoutMethod: data.payoutMethod,
    payoutDetails: data.payoutDetails,
    bio: data.bio,
    specialties: data.specialties,
    payRate: data.payRate,
    payRateType: data.payRateType,
    webflowItemId: data.webflowItemId,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

/**
 * Instructor Repository - handles all Firestore operations for instructors
 */
export const InstructorRepository = {
  /**
   * Find all instructors, optionally filtered by status
   */
  async findAll(filters?: { status?: PayeeStatus }): Promise<Instructor[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('name', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToInstructor(doc))
      .filter((i): i is Instructor => i !== undefined);
  },

  /**
   * Find an instructor by ID
   */
  async findById(id: string): Promise<Instructor | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToInstructor(doc);
  },

  /**
   * Find an instructor by email
   */
  async findByEmail(email: string): Promise<Instructor | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return undefined;
    }

    return docToInstructor(snapshot.docs[0]);
  },

  /**
   * Create a new instructor
   */
  async create(input: CreateInstructorInput): Promise<Instructor> {
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
   * Update an existing instructor
   */
  async update(input: UpdateInstructorInput): Promise<Instructor> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const instructor = docToInstructor(updated);

    if (!instructor) {
      throw new Error(`Instructor ${id} not found after update`);
    }

    return instructor;
  },

  /**
   * Delete an instructor
   * Note: In production, prefer deactivating instructors instead of deleting
   * to preserve historical records.
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Mark an instructor as inactive
   */
  async deactivate(id: string): Promise<Instructor> {
    return this.update({
      id,
      status: 'inactive',
    });
  },

  /**
   * Mark an instructor as active
   */
  async activate(id: string): Promise<Instructor> {
    return this.update({
      id,
      status: 'active',
    });
  },

  /**
   * Update the Webflow item ID for an instructor.
   * Called after syncing to Webflow CMS.
   */
  async updateWebflowItemId(
    id: string,
    webflowItemId: string
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    await docRef.update({ webflowItemId });
  },
};
