/**
 * Student Lesson Schedule Repository (#797)
 *
 * The standing arrangement — "Nathan teaches Ellie on Tuesdays at 4:00" — as an
 * object Katie edits, rather than N concrete lesson rows she has to maintain.
 *
 * Concrete `Lesson` records are still what everything downstream reads; they
 * are materialised from these on a schedule. See `student-lesson-schedule.ts`
 * for why the materialised lesson's document id is derived from the schedule
 * and the date.
 */
import { db, toDate } from './utilities/database.config';
import type {
  CreateStudentLessonScheduleInput,
  StudentLessonSchedule,
  UpdateStudentLessonScheduleInput,
} from '@maple/ts/domain';

const COLLECTION = 'studentLessonSchedules';

function docToSchedule(
  doc: FirebaseFirestore.DocumentSnapshot
): StudentLessonSchedule | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    studentId: data.studentId,
    teacherId: data.teacherId,
    blockId: data.blockId,
    dayOfWeek: data.dayOfWeek,
    startMinutes: data.startMinutes,
    durationMinutes: data.durationMinutes,
    room: data.room,
    startsOn: toDate(data.startsOn),
    endsOn: data.endsOn ? toDate(data.endsOn) : undefined,
    status: data.status,
    notes: data.notes,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Firestore rejects `undefined`; an open-ended schedule genuinely has no end. */
function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as T;
}

/** Weekday, then start time — how a person reads a week. */
function byWeekdayThenStart(
  a: StudentLessonSchedule,
  b: StudentLessonSchedule
): number {
  return a.dayOfWeek - b.dayOfWeek || a.startMinutes - b.startMinutes;
}

export interface StudentLessonScheduleFilters {
  studentId?: string;
  teacherId?: string;
  status?: StudentLessonSchedule['status'];
}

export const StudentLessonScheduleRepository = {
  /**
   * Schedules, optionally scoped.
   *
   * At most one equality filter reaches Firestore; the rest are applied in
   * memory. The studio has tens of these, not thousands, and every extra
   * filter combination would be another composite index to declare and keep.
   */
  async findAll(
    filters: StudentLessonScheduleFilters = {}
  ): Promise<StudentLessonSchedule[]> {
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);
    if (filters.studentId) {
      query = query.where('studentId', '==', filters.studentId);
    } else if (filters.teacherId) {
      query = query.where('teacherId', '==', filters.teacherId);
    }

    const snapshot = await query.get();
    return snapshot.docs
      .map(docToSchedule)
      .filter((s): s is StudentLessonSchedule => s !== undefined)
      .filter((s) => !filters.teacherId || s.teacherId === filters.teacherId)
      .filter((s) => !filters.status || s.status === filters.status)
      .sort(byWeekdayThenStart);
  },

  async findById(id: string): Promise<StudentLessonSchedule | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToSchedule(doc);
  },

  async create(
    input: CreateStudentLessonScheduleInput
  ): Promise<StudentLessonSchedule> {
    const now = new Date();
    const payload = stripUndefined({
      ...input,
      status: input.status ?? 'active',
      createdAt: now,
      updatedAt: now,
    });
    const ref = await db.collection(COLLECTION).add(payload);
    return { id: ref.id, ...payload } as StudentLessonSchedule;
  },

  async update(
    input: UpdateStudentLessonScheduleInput
  ): Promise<StudentLessonSchedule | undefined> {
    const { id, ...changes } = input;
    await db
      .collection(COLLECTION)
      .doc(id)
      .update(stripUndefined({ ...changes, updatedAt: new Date() }));
    return this.findById(id);
  },
};
