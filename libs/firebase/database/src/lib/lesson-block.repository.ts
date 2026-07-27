/**
 * Lesson Block Repository (#686)
 *
 * Firestore access for LessonBlock — the weekly constraint windows lessons
 * are attributed to. All database access goes through this repository.
 */
import { db, toDate } from './utilities/database.config';
import type {
  LessonBlock,
  CreateLessonBlockInput,
  UpdateLessonBlockInput,
} from '@maple/ts/domain';

const COLLECTION = 'lessonBlocks';

function docToLessonBlock(
  doc: FirebaseFirestore.DocumentSnapshot
): LessonBlock | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    teacherId: data.teacherId,
    dayOfWeek: data.dayOfWeek,
    startMinutes: data.startMinutes,
    endMinutes: data.endMinutes,
    label: data.label,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Weekday-then-start-time ordering for stable listing. */
function byWeekdayThenStart(a: LessonBlock, b: LessonBlock): number {
  return a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes;
}

export const LessonBlockRepository = {
  /**
   * All blocks, optionally scoped to one teacher. A single `teacherId`
   * equality filter needs no composite index; ordering is applied in memory.
   */
  async findAll(filters: { teacherId?: string } = {}): Promise<LessonBlock[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters.teacherId) {
      query = query.where('teacherId', '==', filters.teacherId);
    }

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToLessonBlock(doc))
      .filter((b): b is LessonBlock => b !== undefined)
      .sort(byWeekdayThenStart);
  },

  async findById(id: string): Promise<LessonBlock | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToLessonBlock(doc);
  },

  async create(input: CreateLessonBlockInput): Promise<LessonBlock> {
    const docRef = db.collection(COLLECTION).doc();
    const now = new Date();
    const data = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    await docRef.set(data);
    return { id: docRef.id, ...data };
  },

  async update(input: UpdateLessonBlockInput): Promise<LessonBlock> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);
    await docRef.update({ ...updates, updatedAt: new Date() });

    const updated = docToLessonBlock(await docRef.get());
    if (!updated) {
      throw new Error(`LessonBlock ${id} not found after update`);
    }
    return updated;
  },

  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },
};
