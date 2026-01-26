/**
 * Class Repository
 *
 * Handles all Firestore operations for classes/workshops.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Class,
  CreateClassInput,
  UpdateClassInput,
  ClassStatus,
} from '@maple/ts/domain';

const COLLECTION = 'classes';

/**
 * Convert Firestore document to Class
 */
function docToClass(
  doc: FirebaseFirestore.DocumentSnapshot
): Class | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    shortDescription: data.shortDescription,
    instructorId: data.instructorId,
    dateTime: toDate(data.dateTime),
    durationMinutes: data.durationMinutes,
    capacity: data.capacity,
    priceCents: data.priceCents,
    imageUrl: data.imageUrl,
    categoryId: data.categoryId,
    skillLevel: data.skillLevel,
    status: data.status,
    location: data.location,
    materialsIncluded: data.materialsIncluded,
    whatToBring: data.whatToBring,
    minimumAge: data.minimumAge,
    webflowItemId: data.webflowItemId,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Filters for querying classes
 */
export interface ClassFilters {
  status?: ClassStatus;
  categoryId?: string;
  instructorId?: string;
  /** Only return classes scheduled in the future */
  upcoming?: boolean;
}

/**
 * Class Repository - handles all Firestore operations for classes
 */
export const ClassRepository = {
  /**
   * Find all classes with optional filters
   */
  async findAll(filters?: ClassFilters): Promise<Class[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    if (filters?.categoryId) {
      query = query.where('categoryId', '==', filters.categoryId);
    }

    if (filters?.instructorId) {
      query = query.where('instructorId', '==', filters.instructorId);
    }

    if (filters?.upcoming) {
      query = query.where('dateTime', '>', new Date());
    }

    query = query.orderBy('dateTime', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToClass(doc))
      .filter((c): c is Class => c !== undefined);
  },

  /**
   * Find a class by ID
   */
  async findById(id: string): Promise<Class | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToClass(doc);
  },

  /**
   * Create a new class
   */
  async create(input: CreateClassInput): Promise<Class> {
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
   * Update an existing class
   */
  async update(input: UpdateClassInput): Promise<Class> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const classEntity = docToClass(updated);

    if (!classEntity) {
      throw new Error(`Class ${id} not found after update`);
    }

    return classEntity;
  },

  /**
   * Delete a class
   * Note: In production, prefer cancelling classes instead of deleting
   * to preserve historical records and registrations.
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Count confirmed registrations for a class.
   * Used to calculate spots remaining.
   */
  async countRegistrations(classId: string): Promise<number> {
    const snapshot = await db
      .collection('registrations')
      .where('classId', '==', classId)
      .where('status', 'in', ['pending', 'confirmed'])
      .count()
      .get();

    return snapshot.data().count;
  },

  /**
   * Update the Webflow item ID for a class.
   * Called after syncing to Webflow CMS.
   */
  async updateWebflowItemId(id: string, webflowItemId: string): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    await docRef.update({ webflowItemId });
  },

  /**
   * Cancel a class
   */
  async cancel(id: string): Promise<Class> {
    return this.update({
      id,
      status: 'cancelled',
    });
  },

  /**
   * Publish a class (make it visible for registration)
   */
  async publish(id: string): Promise<Class> {
    return this.update({
      id,
      status: 'published',
    });
  },

  /**
   * Mark a class as completed
   */
  async complete(id: string): Promise<Class> {
    return this.update({
      id,
      status: 'completed',
    });
  },
};
