/**
 * Lesson Inquiry Repository (#795)
 *
 * Firestore access for lesson inquiries captured from Tally.
 *
 * The document id is the **Tally submission id**, which is what makes ingestion
 * idempotent without a read-then-write: `createIfAbsent` uses Firestore's
 * `create()`, so a re-poll of a submission already stored fails with
 * ALREADY_EXISTS and is reported as "skipped" rather than overwriting a lead
 * whose status Katie has since advanced. That last part is the important one —
 * a naive `set()` here would silently reset an `enrolled` lead back to `new`
 * on the next scheduled run.
 */
import { db, toDate } from './utilities/database.config';
import type {
  CreateLessonInquiryInput,
  LessonInquiry,
  LessonInquiryStatus,
  UpdateLessonInquiryStatusInput,
} from '@maple/ts/domain';

const COLLECTION = 'lessonInquiries';

/** gRPC ALREADY_EXISTS — Firestore throws this from `create()` on a known id. */
const GRPC_ALREADY_EXISTS = 6;

function isAlreadyExists(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === GRPC_ALREADY_EXISTS
  );
}

function docToLessonInquiry(
  doc: FirebaseFirestore.DocumentSnapshot
): LessonInquiry | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    formId: data.formId,
    formName: data.formName,
    submittedAt: toDate(data.submittedAt),
    contactName: data.contactName,
    email: data.email,
    phone: data.phone,
    studentFirstName: data.studentFirstName,
    studentAge: data.studentAge,
    interest: data.interest,
    availability: data.availability ?? [],
    hopeScholarship: data.hopeScholarship,
    message: data.message,
    status: data.status,
    studentId: data.studentId,
    followUpNote: data.followUpNote,
    attribution: data.attribution ?? {},
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/**
 * Firestore rejects `undefined` field values. Optional answers are genuinely
 * absent on the shared form, so strip rather than storing nulls that would then
 * have to be unwound on read.
 */
function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && !(entry instanceof Date)) {
      out[key] = stripUndefined(entry as Record<string, unknown>);
      continue;
    }
    out[key] = entry;
  }
  return out as T;
}

export const LessonInquiryRepository = {
  /**
   * Store a newly-seen inquiry. Returns the created record, or `null` when the
   * submission is already stored — never an overwrite. Callers use the null to
   * count skips.
   */
  async createIfAbsent(
    input: CreateLessonInquiryInput
  ): Promise<LessonInquiry | null> {
    const now = new Date();
    const { id, ...rest } = input;
    const payload = stripUndefined({
      ...rest,
      status: input.status ?? ('new' as LessonInquiryStatus),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await db.collection(COLLECTION).doc(id).create(payload);
    } catch (err) {
      if (isAlreadyExists(err)) return null;
      throw err;
    }

    return { id, ...payload } as LessonInquiry;
  },

  async findById(id: string): Promise<LessonInquiry | undefined> {
    const doc = await db.collection(COLLECTION).doc(id).get();
    return docToLessonInquiry(doc);
  },

  /**
   * Inquiries newest-first.
   *
   * A `status` equality filter combined with the `submittedAt` ordering would
   * need a composite index; the studio's inquiry volume is small enough that
   * filtering in memory is cheaper than another declared index to maintain.
   * Revisit if this ever passes a few thousand rows.
   */
  async findAll(
    filters: { status?: LessonInquiryStatus } = {}
  ): Promise<LessonInquiry[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .orderBy('submittedAt', 'desc')
      .get();

    const all = snapshot.docs
      .map((doc) => docToLessonInquiry(doc))
      .filter((inquiry): inquiry is LessonInquiry => inquiry !== undefined);

    return filters.status
      ? all.filter((inquiry) => inquiry.status === filters.status)
      : all;
  },

  /**
   * Every stored inquiry keyed by submission id, for deciding what a sync run
   * still has to do: an id that is absent needs creating, and one that is
   * present but whose ingested answers have drifted needs refreshing.
   *
   * This reads whole documents where an id-only projection would do, because
   * `refreshIngestedFields` needs something to compare against. Firestore bills
   * a read per document either way — the projection only ever saved bandwidth,
   * on a collection the rest of this repository is already happy to pull in
   * full (see `findAll`).
   */
  async findAllBySubmissionId(): Promise<Map<string, LessonInquiry>> {
    const snapshot = await db.collection(COLLECTION).get();
    const byId = new Map<string, LessonInquiry>();
    for (const doc of snapshot.docs) {
      const inquiry = docToLessonInquiry(doc);
      if (inquiry) byId.set(inquiry.id, inquiry);
    }
    return byId;
  },

  /**
   * Overwrite only the fields ingestion owns, leaving every human-owned field
   * (`status`, `studentId`, `followUpNote`, `createdAt`) exactly as it was.
   *
   * This is the counterweight to `createIfAbsent`. That method's refusal to
   * overwrite is what stops the next poll resetting an `enrolled` lead to
   * `new` — but it also made a mapping bug permanent. All 14 leads stored on
   * 2026-09-04 had `contactName: "Unknown"` and no `interest`, and fixing the
   * mapper could never have reached them: the only route was to delete and
   * re-ingest, which would have discarded the statuses along with the bug.
   *
   * Splitting the document by **ownership** rather than by age is what lets
   * both properties hold at once — Tally owns the answers and may correct
   * them, the portal owns the workflow and is never overwritten.
   *
   * A field that maps to `undefined` is left alone rather than deleted. A Tally
   * submission is immutable, so an answer does not vanish; what does happen is
   * an editor renaming a question, and keeping the last known good answer is
   * the better failure there than blanking the card.
   */
  async refreshIngestedFields(
    input: CreateLessonInquiryInput
  ): Promise<LessonInquiry | undefined> {
    const { id, status: _status, ...ingested } = input;
    await db
      .collection(COLLECTION)
      .doc(id)
      .update(stripUndefined({ ...ingested, updatedAt: new Date() }));
    return this.findById(id);
  },

  async updateStatus(
    input: UpdateLessonInquiryStatusInput
  ): Promise<LessonInquiry | undefined> {
    const { id, ...changes } = input;
    await db
      .collection(COLLECTION)
      .doc(id)
      .update(stripUndefined({ ...changes, updatedAt: new Date() }));
    return this.findById(id);
  },
};
