/**
 * Lesson Repository
 *
 * Handles all Firestore operations for music lessons.
 */
import { db, toDate } from './utilities/database.config';
import type {
  Lesson,
  CreateLessonInput,
  UpdateLessonInput,
  CreateLessonSeriesInput,
  LessonStatus,
} from '@maple/ts/domain';

const COLLECTION = 'lessons';

function docToLesson(
  doc: FirebaseFirestore.DocumentSnapshot,
): Lesson | undefined {
  if (!doc.exists) {
    return undefined;
  }

  const data = doc.data()!;
  return {
    id: doc.id,
    studentId: data.studentId,
    scheduledAt: toDate(data.scheduledAt),
    durationMinutes: data.durationMinutes,
    teacherId: data.teacherId,
    primaryTeacherAtCreateId: data.primaryTeacherAtCreateId,
    seriesId: data.seriesId,
    blockId: data.blockId ?? null,
    scheduleId: data.scheduleId ?? undefined,
    room: data.room,
    status: data.status,
    notes: data.notes,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export interface LessonFilters {
  studentId?: string;
  teacherId?: string;
  seriesId?: string;
  status?: LessonStatus;
  /** Inclusive lower bound on scheduledAt */
  from?: Date;
  /** Inclusive upper bound on scheduledAt */
  to?: Date;
}

export const LessonRepository = {
  async findAll(filters: LessonFilters = {}): Promise<Lesson[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);

    if (filters.studentId) {
      query = query.where('studentId', '==', filters.studentId);
    }
    if (filters.teacherId) {
      query = query.where('teacherId', '==', filters.teacherId);
    }
    if (filters.seriesId) {
      query = query.where('seriesId', '==', filters.seriesId);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    if (filters.from) {
      query = query.where('scheduledAt', '>=', filters.from);
    }
    if (filters.to) {
      query = query.where('scheduledAt', '<=', filters.to);
    }

    query = query.orderBy('scheduledAt', 'asc');

    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => docToLesson(doc))
      .filter((l): l is Lesson => l !== undefined);
  },

  async findById(id: string): Promise<Lesson | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToLesson(doc);
  },

  async create(input: CreateLessonInput): Promise<Lesson> {
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
   * Create a lesson at a caller-chosen document id, failing if it already
   * exists (#797).
   *
   * The materialiser derives that id from the schedule and the occurrence date,
   * which is what makes re-running a no-op — and what makes a skipped or moved
   * week stay skipped or moved, since the document is still there either way.
   * Returns null on collision rather than throwing, because collision IS the
   * expected steady state.
   */
  async createWithId(
    id: string,
    input: CreateLessonInput
  ): Promise<Lesson | null> {
    const now = new Date();
    const data = { ...input, createdAt: now, updatedAt: now };
    try {
      await db.collection(COLLECTION).doc(id).create(data);
    } catch (err) {
      // gRPC ALREADY_EXISTS
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === 6
      ) {
        return null;
      }
      throw err;
    }
    return { id, ...data };
  },

  /**
   * Atomically create N lessons sharing a seriesId. Client supplies the
   * concrete date list; we don't re-derive from a cadence here so holiday
   * skips made in the preview step are honored exactly.
   */
  async createSeries(
    input: CreateLessonSeriesInput,
  ): Promise<{ lessons: Lesson[]; seriesId: string }> {
    const seriesRef = db.collection(COLLECTION).doc();
    const seriesId = seriesRef.id;
    const now = new Date();

    const batch = db.batch();
    const docRefs: FirebaseFirestore.DocumentReference[] = [];

    for (const scheduledAt of input.scheduledAts) {
      const lessonRef = db.collection(COLLECTION).doc();
      docRefs.push(lessonRef);

      batch.set(lessonRef, {
        studentId: input.studentId,
        teacherId: input.teacherId,
        primaryTeacherAtCreateId: input.primaryTeacherAtCreateId,
        durationMinutes: input.durationMinutes,
        scheduledAt,
        seriesId,
        blockId: input.blockId ?? null,
        room: input.room,
        status: (input.status ?? 'scheduled') as LessonStatus,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      });
    }

    await batch.commit();

    const lessons: Lesson[] = docRefs.map((ref, i) => ({
      id: ref.id,
      studentId: input.studentId,
      scheduledAt: input.scheduledAts[i],
      durationMinutes: input.durationMinutes,
      teacherId: input.teacherId,
      primaryTeacherAtCreateId: input.primaryTeacherAtCreateId,
      seriesId,
      blockId: input.blockId ?? null,
      room: input.room,
      status: input.status ?? 'scheduled',
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    }));

    return { lessons, seriesId };
  },

  async update(input: UpdateLessonInput): Promise<Lesson> {
    const { id, ...updates } = input;
    const docRef = db.collection(COLLECTION).doc(id);

    const dataWithTimestamp = {
      ...updates,
      updatedAt: new Date(),
    };

    await docRef.update(dataWithTimestamp);

    const updated = await docRef.get();
    const lesson = docToLesson(updated);

    if (!lesson) {
      throw new Error(`Lesson ${id} not found after update`);
    }

    return lesson;
  },

  async delete(id: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).delete();
  },
};
