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
    squarePaymentId: data.squarePaymentId,
    squareOrderId: data.squareOrderId,
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
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
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
      .count()
      .get();

    return snapshot.data().count;
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
