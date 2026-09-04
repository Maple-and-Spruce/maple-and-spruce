/**
 * Hope Submission Repository (#799)
 *
 * What has been claimed from the EMA portal for a rendered Hope lesson.
 *
 * The document id is the **lesson id**, so one lesson can only ever have one
 * claim. That is what makes a rejected-then-resubmitted lesson update its own
 * record instead of accumulating duplicates that could be claimed twice.
 *
 * There is no `pending` row: a lesson awaiting submission simply has no
 * document here (see `hope-submission.ts`). Nothing has to materialise rows,
 * and no lesson can be lost by failing to get one.
 */
import { db, toDate } from './utilities/database.config';
import type {
  HopeSubmission,
  RecordHopeSubmissionInput,
} from '@maple/ts/domain';

const COLLECTION = 'hopeSubmissions';

function docToSubmission(
  doc: FirebaseFirestore.DocumentSnapshot
): HopeSubmission | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    lessonId: data.lessonId,
    studentId: data.studentId,
    teacherId: data.teacherId,
    lessonDate: toDate(data.lessonDate),
    status: data.status,
    rateCents: data.rateCents,
    submittedAt: toDate(data.submittedAt),
    paidAt: data.paidAt ? toDate(data.paidAt) : undefined,
    emaReference: data.emaReference,
    rejectionReason: data.rejectionReason,
    recordedByUid: data.recordedByUid,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Firestore rejects `undefined`; optional claim fields are genuinely absent. */
function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out as T;
}

export const HopeSubmissionRepository = {
  async findById(lessonId: string): Promise<HopeSubmission | undefined> {
    const doc = await db.collection(COLLECTION).doc(lessonId).get();
    return docToSubmission(doc);
  },

  /**
   * Claims for a set of lessons, keyed by lesson id.
   *
   * Firestore caps an `in` filter at 30 values, so this reads by document id in
   * chunks rather than one query. At studio volume that is a handful of reads.
   */
  async findByLessonIds(
    lessonIds: string[]
  ): Promise<Map<string, HopeSubmission>> {
    const found = new Map<string, HopeSubmission>();
    if (lessonIds.length === 0) return found;

    const CHUNK = 30;
    for (let i = 0; i < lessonIds.length; i += CHUNK) {
      const refs = lessonIds
        .slice(i, i + CHUNK)
        .map((id) => db.collection(COLLECTION).doc(id));
      const docs = await db.getAll(...refs);
      for (const doc of docs) {
        const submission = docToSubmission(doc);
        if (submission) found.set(submission.lessonId, submission);
      }
    }

    return found;
  },

  /**
   * Record or update the claim for one lesson.
   *
   * A `set` with merge, not a `create`: resubmitting a rejected claim is a
   * legitimate update of the same record, and the caller has already checked
   * the lesson is submittable.
   */
  async record(
    input: RecordHopeSubmissionInput
  ): Promise<HopeSubmission | undefined> {
    const now = new Date();
    const ref = db.collection(COLLECTION).doc(input.lessonId);
    const existing = await ref.get();

    await ref.set(
      stripUndefined({
        ...input,
        createdAt: existing.exists ? existing.data()?.createdAt ?? now : now,
        updatedAt: now,
      }),
      { merge: true }
    );

    return this.findById(input.lessonId);
  },
};
