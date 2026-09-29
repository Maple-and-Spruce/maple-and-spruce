/**
 * Instructor Repository
 *
 * Handles all Firestore operations for instructors.
 * All database access should go through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Instructor,
  CreateInstructorInput,
  InstructorReadiness,
  UpdateInstructorInput,
  PayeeStatus,
} from '@maple/ts/domain';

const COLLECTION = 'instructors';

/**
 * Read the readiness map back item by item, so a partial or hand-edited
 * document yields only well-formed items (an item without its date is
 * dropped, which reads as "not done" — the safe direction).
 */
function docToReadiness(raw: unknown): InstructorReadiness | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, Record<string, unknown> | undefined>;
  const readiness: InstructorReadiness = {};

  const agreement = r['contractorAgreement'];
  if (typeof agreement?.['signedOn'] === 'string') {
    readiness.contractorAgreement = {
      signedOn: agreement['signedOn'],
      ...(typeof agreement['reference'] === 'string'
        ? { reference: agreement['reference'] }
        : {}),
    };
  }

  const check = r['backgroundCheck'];
  if (typeof check?.['clearedOn'] === 'string') {
    readiness.backgroundCheck = { clearedOn: check['clearedOn'] };
  }

  const payment = r['paymentSetup'];
  if (
    typeof payment?.['completedOn'] === 'string' &&
    (payment['method'] === 'square-payroll' || payment['method'] === 'w9-on-file')
  ) {
    readiness.paymentSetup = {
      completedOn: payment['completedOn'],
      method: payment['method'],
    };
  }

  return readiness;
}

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
    // Firestore may store null for an unlinked instructor; normalize to undefined.
    uid: data.uid ?? undefined,
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
    isContractor: data.isContractor ?? undefined,
    readiness: docToReadiness(data.readiness),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
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
   * Find the instructor linked to a portal user (Firebase Auth UID), if any.
   * Used to resolve a lesson-teacher caller to the instructor record whose
   * lessons they own. Returns undefined when the user isn't linked.
   */
  async findByUid(uid: string): Promise<Instructor | undefined> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('uid', '==', uid)
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
   * Update an existing instructor.
   *
   * `readiness`, when present, replaces the whole stored record (Firestore
   * `update` replaces a top-level map), so the form sends every item it
   * knows about and an item left out is cleared.
   */
  async update(
    // uid accepts null so callers can unlink a portal login (writes null;
    // docToInstructor normalizes it back to undefined on read).
    input: Omit<UpdateInstructorInput, 'uid'> & { uid?: string | null }
  ): Promise<Instructor> {
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
