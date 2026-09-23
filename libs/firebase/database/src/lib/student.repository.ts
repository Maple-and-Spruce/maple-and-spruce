/**
 * Student Repository
 *
 * Handles all Firestore operations for music lesson students.
 * All database access should go through this repository.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { db, toDate } from './utilities/database.config';
import type {
  Student,
  CreateStudentInput,
  UpdateStudentInput,
  StudentStatus,
} from '@maple/ts/domain';

const COLLECTION = 'students';

function docToStudent(
  doc: FirebaseFirestore.DocumentSnapshot
): Student | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    name: data.name,
    instrument: data.instrument,
    isAdultStudent: data.isAdultStudent ?? false,
    primaryTeacherId: data.primaryTeacherId,
    registeredLessonLength: data.registeredLessonLength,
    isHopeScholarship: data.isHopeScholarship ?? false,
    primaryContactName: data.primaryContactName,
    primaryContactEmail: data.primaryContactEmail,
    primaryContactPhone: data.primaryContactPhone,
    secondaryContactEmail: data.secondaryContactEmail,
    secondaryContactPhone: data.secondaryContactPhone,
    venmoUsername: data.venmoUsername,
    lessonRateCents: data.lessonRateCents,
    // Card on file. Katie and Nathan save the card in Square in person; the
    // portal links to it rather than making the family re-enter it (#81).
    squareCustomerId: data.squareCustomerId,
    squareCardId: data.squareCardId,
    cardBrand: data.cardBrand,
    cardLast4: data.cardLast4,
    cardLinkedAt: data.cardLinkedAt ? toDate(data.cardLinkedAt) : undefined,
    billingRuleId: data.billingRuleId,
    notes: data.notes,
    status: data.status,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export const StudentRepository = {
  async findAll(filters?: {
    status?: StudentStatus;
    primaryTeacherId?: string;
    isHopeScholarship?: boolean;
  }): Promise<Student[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters?.status) {
      query = query.where('status', '==', filters.status);
    }

    if (filters?.primaryTeacherId) {
      query = query.where('primaryTeacherId', '==', filters.primaryTeacherId);
    }

    if (filters?.isHopeScholarship !== undefined) {
      query = query.where('isHopeScholarship', '==', filters.isHopeScholarship);
    }

    query = query.orderBy('name', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToStudent(doc))
      .filter((s): s is Student => s !== undefined);
  },

  async findById(id: string): Promise<Student | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToStudent(doc);
  },

  /**
   * Find students whose primary contact email matches (case-insensitive on the
   * caller's part — pass an already-normalized email). Returns an array
   * because siblings share a parent/guardian email; callers auto-attribute
   * only when exactly one student matches and route ambiguous (0 or >1) cases
   * to human review. See legacy #628.
   */
  async findByPrimaryContactEmail(email: string): Promise<Student[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('primaryContactEmail', '==', email)
      .get();
    return snapshot.docs
      .map((doc) => docToStudent(doc))
      .filter((s): s is Student => s !== undefined);
  },

  async create(input: CreateStudentInput): Promise<Student> {
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
   * Attach a card on file to a student, or detach whatever is attached (#81).
   *
   * Its own method rather than a plain `update` because **detaching has to
   * delete the fields**, and the generic update path cannot: the Admin SDK
   * drops `undefined` instead of clearing, so unlinking through it silently
   * left the old card in place and the billing job kept charging it.
   * `FieldValue.delete()` is the only thing that actually removes a field.
   *
   * Nothing in Square is touched either way — the card stays on file for Katie
   * to charge by hand.
   */
  async setSquareCard(
    id: string,
    card: {
      squareCustomerId: string;
      squareCardId: string;
      cardBrand?: string;
      cardLast4?: string;
    } | null
  ): Promise<Student> {
    const docRef = db.collection(COLLECTION).doc(id);

    await docRef.update(
      card
        ? {
            squareCustomerId: card.squareCustomerId,
            squareCardId: card.squareCardId,
            cardBrand: card.cardBrand ?? FieldValue.delete(),
            cardLast4: card.cardLast4 ?? FieldValue.delete(),
            cardLinkedAt: new Date(),
            updatedAt: new Date(),
          }
        : {
            squareCustomerId: FieldValue.delete(),
            squareCardId: FieldValue.delete(),
            cardBrand: FieldValue.delete(),
            cardLast4: FieldValue.delete(),
            cardLinkedAt: FieldValue.delete(),
            updatedAt: new Date(),
          }
    );

    const student = docToStudent(await docRef.get());
    if (!student) throw new Error(`Student ${id} not found after update`);
    return student;
  },

  async update(input: UpdateStudentInput): Promise<Student> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const student = docToStudent(updated);

    if (!student) {
      throw new Error(`Student ${id} not found after update`);
    }

    return student;
  },

  /**
   * Delete a student. Prefer deactivate() in production to preserve lesson
   * and invoice history tied to the student.
   */
  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },

  async deactivate(id: string): Promise<Student> {
    return this.update({
      id,
      status: 'inactive',
    });
  },

  async activate(id: string): Promise<Student> {
    return this.update({
      id,
      status: 'active',
    });
  },
};
