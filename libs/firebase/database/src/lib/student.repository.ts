/**
 * Student Repository
 *
 * Handles all Firestore operations for music lesson students.
 * All database access should go through this repository.
 */
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
