/**
 * Registration Repository
 *
 * Handles all Firestore operations for class registrations.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Registration,
  CreateRegistrationInput,
  UpdateRegistrationInput,
  RegistrationStatus,
} from '@maple/ts/domain';

const COLLECTION = 'registrations';

/**
 * Convert Firestore document to Registration
 */
function docToRegistration(
  doc: FirebaseFirestore.DocumentSnapshot
): Registration | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    classId: data.classId,
    customerEmail: data.customerEmail,
    customerName: data.customerName,
    customerPhone: data.customerPhone,
    quantity: data.quantity,
    pricePaidCents: data.pricePaidCents,
    subtotalCents: data.subtotalCents,
    taxAmountCents: data.taxAmountCents,
    taxRatePercent: data.taxRatePercent,
    squarePaymentId: data.squarePaymentId,
    squareOrderId: data.squareOrderId,
    squareReceiptUrl: data.squareReceiptUrl,
    discountCode: data.discountCode,
    discountAmountCents: data.discountAmountCents,
    status: data.status as RegistrationStatus,
    notes: data.notes,
    confirmationSentAt: data.confirmationSentAt
      ? toDate(data.confirmationSentAt)
      : undefined,
    reminderSentAt: data.reminderSentAt
      ? toDate(data.reminderSentAt)
      : undefined,
    reminderSentForSessions: parseReminderSentForSessions(
      data.reminderSentForSessions
    ),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Convert the persisted `reminderSentForSessions` map into a
 * `Record<string, Date>`. The persisted form is `{ [sessionIso]: Timestamp }`
 * (or ISO string in tests); this normalizes either shape.
 */
function parseReminderSentForSessions(
  raw: unknown
): Record<string, Date> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    return undefined;
  }
  const result: Record<string, Date> = {};
  for (const [key, value] of entries) {
    if (value === undefined || value === null) continue;
    result[key] = toDate(value);
  }
  return result;
}

/**
 * Filters for querying registrations
 */
export interface RegistrationFilters {
  classId?: string;
  customerEmail?: string;
  status?: RegistrationStatus;
}

/**
 * Registration Repository - handles all Firestore operations for registrations
 */
export const RegistrationRepository = {
  /**
   * Find all registrations with optional filters
   */
  async findAll(filters?: RegistrationFilters): Promise<Registration[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.classId) {
      query = query.where('classId', '==', filters.classId);
    }

    if (filters?.customerEmail) {
      query = query.where('customerEmail', '==', filters.customerEmail);
    }

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToRegistration(doc))
      .filter((r): r is Registration => r !== undefined);
  },

  /**
   * Find a registration by ID
   */
  async findById(id: string): Promise<Registration | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToRegistration(doc);
  },

  /**
   * Find all registrations for a specific class
   */
  async findByClassId(classId: string): Promise<Registration[]> {
    return this.findAll({ classId });
  },

  /**
   * Count registrations for a class by status.
   * Defaults to counting pending + confirmed (spots taken).
   */
  async countByClassId(
    classId: string,
    statuses: RegistrationStatus[] = ['pending', 'confirmed']
  ): Promise<number> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('classId', '==', classId)
      .where('status', 'in', statuses)
      .get();

    return snapshot.docs.reduce((sum, doc) => {
      return sum + ((doc.data().quantity as number) || 1);
    }, 0);
  },

  /**
   * Create a new registration
   */
  async create(input: CreateRegistrationInput): Promise<Registration> {
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
   * Update an existing registration
   */
  async update(input: UpdateRegistrationInput): Promise<Registration> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const registration = docToRegistration(updated);

    if (!registration) {
      throw new Error(`Registration ${id} not found after update`);
    }

    return registration;
  },

  /**
   * Delete a registration
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Stamp the reminder-sent fields for a specific session of a multi-session
   * class. Used by the `sendClassReminders` scheduled function to guarantee
   * idempotency: the second run on the same day must not re-send.
   *
   * Updates two fields atomically:
   * - `reminderSentForSessions[sessionIso]` — per-session timestamp,
   *   our authoritative idempotency key.
   * - `reminderSentAt` — most recent reminder timestamp (any session),
   *   useful for admin UI and at-a-glance queries.
   *
   * @param id The registration ID
   * @param sessionIso The ISO string of the session's start dateTime
   *   (used as the map key — must match exactly across runs)
   * @param now Optional timestamp; defaults to `new Date()`
   */
  async markReminderSentForSession(
    id: string,
    sessionIso: string,
    now: Date = new Date()
  ): Promise<void> {
    const docRef = db.collection(COLLECTION).doc(id);
    await docRef.update({
      [`reminderSentForSessions.${sessionIso}`]: now,
      reminderSentAt: now,
      updatedAt: now,
    });
  },

  /**
   * Get the Firestore collection reference (for transactions)
   */
  getCollectionRef() {
    return db.collection(COLLECTION);
  },

  /**
   * Get a document reference (for transactions)
   */
  getDocRef(id?: string) {
    return id
      ? db.collection(COLLECTION).doc(id)
      : db.collection(COLLECTION).doc();
  },
};
