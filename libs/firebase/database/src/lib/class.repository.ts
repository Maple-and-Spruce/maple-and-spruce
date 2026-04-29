/**
 * Class Repository
 *
 * Handles all Firestore operations for classes/workshops.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Class,
  ClassSession,
  CreateClassInput,
  UpdateClassInput,
  ClassStatus,
} from '@maple/ts/domain';

const COLLECTION = 'classes';

/**
 * Convert raw Firestore session entries to ClassSession objects.
 *
 * Tolerates:
 * - the new shape: `[{ dateTime: Timestamp }]`
 * - legacy docs that haven't been migrated yet: a scalar `dateTime` field
 *   (the caller handles the fallback by passing `data.dateTime`).
 */
function parseSessions(
  rawSessions: unknown,
  legacyDateTime: unknown
): ClassSession[] {
  if (Array.isArray(rawSessions) && rawSessions.length > 0) {
    return rawSessions
      .map((entry) => {
        const dateField =
          entry && typeof entry === 'object' && 'dateTime' in entry
            ? (entry as { dateTime: unknown }).dateTime
            : entry;
        return { dateTime: toDate(dateField) };
      })
      .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  }

  if (legacyDateTime !== undefined && legacyDateTime !== null) {
    return [{ dateTime: toDate(legacyDateTime) }];
  }

  return [];
}

/**
 * Normalize input sessions to a sorted array of `{ dateTime: Date }`.
 */
function normalizeSessionsInput(sessions: ClassSession[]): ClassSession[] {
  return sessions
    .map((s) => ({
      dateTime: s.dateTime instanceof Date ? s.dateTime : new Date(s.dateTime),
    }))
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
}

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
  const sessions = parseSessions(data.sessions, data.dateTime);

  return {
    id: doc.id,
    name: data.name,
    description: data.description,
    shortDescription: data.shortDescription,
    instructorId: data.instructorId,
    sessions,
    durationMinutes: data.durationMinutes,
    registrationClosesAt: data.registrationClosesAt
      ? toDate(data.registrationClosesAt)
      : undefined,
    capacity: data.capacity,
    priceCents: data.priceCents,
    imageUrl: data.imageUrl,
    galleryImages: data.galleryImages,
    categoryId: data.categoryId,
    skillLevel: data.skillLevel,
    status: data.status,
    location: data.location,
    materialsIncluded: data.materialsIncluded,
    whatToBring: data.whatToBring,
    minimumAge: data.minimumAge,
    webflowItemId: data.webflowItemId,
    referralDiscount:
      data.referralDiscount &&
      typeof data.referralDiscount.percent === 'number' &&
      typeof data.referralDiscount.expiresAfterDays === 'number'
        ? {
            percent: data.referralDiscount.percent,
            expiresAfterDays: data.referralDiscount.expiresAfterDays,
          }
        : undefined,
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

    // Sort by a top-level indexed field — `firstSessionAt` mirrors the
    // earliest session and is written on every create/update below.
    query = query.orderBy('firstSessionAt', 'asc');

    const snapshot = await query.get();
    let results = snapshot.docs
      .map((doc) => docToClass(doc))
      .filter((c): c is Class => c !== undefined);

    if (filters?.upcoming) {
      const now = Date.now();
      results = results.filter((c) =>
        c.sessions.some((s) => s.dateTime.getTime() > now)
      );
    }

    return results;
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
    const sessions = normalizeSessionsInput(input.sessions);
    const firstSessionAt = sessions[0]?.dateTime ?? now;

    const data = {
      ...input,
      sessions: sessions.map((s) => ({ dateTime: s.dateTime })),
      firstSessionAt,
      registrationClosesAt: input.registrationClosesAt
        ? new Date(input.registrationClosesAt)
        : null,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(data);

    return {
      id: docRef.id,
      ...input,
      sessions,
      registrationClosesAt: input.registrationClosesAt
        ? new Date(input.registrationClosesAt)
        : undefined,
      createdAt: now,
      updatedAt: now,
    };
  },

  /**
   * Update an existing class
   */
  async update(input: UpdateClassInput): Promise<Class> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const normalizedSessions = updates.sessions
      ? normalizeSessionsInput(updates.sessions)
      : undefined;

    const dataWithTimestamp: Record<string, unknown> = {
      ...updates,
      updatedAt: new Date(),
    };

    if (normalizedSessions) {
      dataWithTimestamp.sessions = normalizedSessions.map((s) => ({
        dateTime: s.dateTime,
      }));
      dataWithTimestamp.firstSessionAt = normalizedSessions[0]?.dateTime ?? null;
    }

    if ('registrationClosesAt' in updates) {
      dataWithTimestamp.registrationClosesAt = updates.registrationClosesAt
        ? new Date(updates.registrationClosesAt)
        : null;
    }

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
