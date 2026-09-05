/**
 * Lesson Scheduled Charge Repository (#798)
 *
 * Deliberately mirrors `MusicTogetherScheduledChargeRepository`. The lease, the
 * stable idempotency key and the cancel guard are what make "charge at most
 * once" true rather than hoped for, and that trio is already proven on the MT
 * installment path — a second, subtly different implementation would mean
 * re-earning that confidence with real money.
 */
import { db, getDb, toDate } from './utilities/database.config';
import {
  lessonChargeIdempotencyKey,
  type CreateLessonScheduledChargeInput,
  type LessonChargeStatus,
  type LessonScheduledCharge,
} from '@maple/ts/domain';

const COLLECTION = 'lessonScheduledCharges';

/** gRPC ALREADY_EXISTS — the steady state when re-planning, not an error. */
const GRPC_ALREADY_EXISTS = 6;

function docToCharge(
  doc: FirebaseFirestore.DocumentSnapshot
): LessonScheduledCharge | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    studentId: data.studentId,
    ruleId: data.ruleId,
    lessonIds: data.lessonIds ?? [],
    amountCents: data.amountCents,
    dueAt: toDate(data.dueAt),
    status: data.status,
    idempotencyKey: data.idempotencyKey,
    squarePaymentId: data.squarePaymentId,
    lastError: data.lastError,
    waivedReason: data.waivedReason,
    waivedByUid: data.waivedByUid,
    resolvedAt: data.resolvedAt ? toDate(data.resolvedAt) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Move a charge to a terminal status, in a transaction.
 *
 * Guarded on `scheduled` rather than read-then-write: the charge job could
 * claim the lease between an admin's read and their click. Returns undefined
 * when the charge is no longer `scheduled` — a charge that is charging, paid or
 * failed must not be silently rewritten, because the money has either moved or
 * someone needs to see why it did not.
 */
async function tryTerminate(
  id: string,
  status: Extract<LessonChargeStatus, 'waived' | 'cancelled'>,
  extra: Partial<LessonScheduledCharge> = {}
): Promise<LessonScheduledCharge | undefined> {
  const database = getDb();
  const docRef = database.collection(COLLECTION).doc(id);
  const won = await database.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    if (!snap.exists || snap.data()?.status !== 'scheduled') return false;
    tx.update(docRef, {
      ...extra,
      status,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    });
    return true;
  });
  return won ? LessonScheduledChargeRepository.findById(id) : undefined;
}

export const LessonScheduledChargeRepository = {
  /**
   * Create a planned charge at its deterministic id, or report that it is
   * already there. A collision is the expected outcome of re-planning, so it
   * returns null rather than throwing.
   */
  async createIfAbsent(
    input: CreateLessonScheduledChargeInput
  ): Promise<LessonScheduledCharge | null> {
    const now = new Date();
    const { id, ...rest } = input;
    const payload = stripUndefined({
      ...rest,
      status: input.status ?? 'scheduled',
      idempotencyKey: lessonChargeIdempotencyKey(id),
      createdAt: now,
      updatedAt: now,
    });

    try {
      await db.collection(COLLECTION).doc(id).create(payload);
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === GRPC_ALREADY_EXISTS
      ) {
        return null;
      }
      throw err;
    }

    return { id, ...payload } as LessonScheduledCharge;
  },

  async findById(id: string): Promise<LessonScheduledCharge | undefined> {
    return docToCharge(await db.collection(COLLECTION).doc(id).get());
  },

  async findAll(
    filters: { studentId?: string; status?: LessonScheduledCharge['status'] } = {}
  ): Promise<LessonScheduledCharge[]> {
    // Both filters are pushed into the query rather than applied in memory:
    // the daily billing job asks for `scheduled` charges, and every charge ever
    // taken stays in this collection forever. Filtering after the read would
    // make that job's cost grow with the studio's whole billing history.
    //
    // The sort stays in memory on purpose — an `orderBy` on a third field would
    // widen every index here for a result set that is small once filtered.
    let query: FirebaseFirestore.Query = db.collection(COLLECTION);
    if (filters.studentId) {
      query = query.where('studentId', '==', filters.studentId);
    }
    if (filters.status) {
      query = query.where('status', '==', filters.status);
    }
    const snapshot = await query.get();
    return snapshot.docs
      .map(docToCharge)
      .filter((c): c is LessonScheduledCharge => c !== undefined)
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  },

  /**
   * Claim a charge for processing: `scheduled → charging`, in a transaction.
   *
   * This is the first of the three overcharge defences — two overlapping runs
   * cannot both take one charge, because only one wins the transaction.
   */
  async tryClaimLease(id: string): Promise<boolean> {
    const database = getDb();
    const docRef = database.collection(COLLECTION).doc(id);
    return database.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      if (!snap.exists || snap.data()?.status !== 'scheduled') return false;
      tx.update(docRef, { status: 'charging', updatedAt: new Date() });
      return true;
    });
  },

  async markPaid(id: string, squarePaymentId: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).update({
      status: 'paid',
      squarePaymentId,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    });
  },

  /** Failures are loud and terminal — never silently retried. */
  async markFailed(id: string, lastError: string): Promise<void> {
    await db.collection(COLLECTION).doc(id).update({
      status: 'failed',
      lastError,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    });
  },

  /**
   * Forgive a charge that has not been taken: `scheduled → waived`. The reason
   * and the admin who set it are recorded, because a comped block has to stay
   * legible on the record months later.
   */
  async tryWaive(
    id: string,
    waivedReason: string,
    waivedByUid: string
  ): Promise<LessonScheduledCharge | undefined> {
    return tryTerminate(id, 'waived', { waivedReason, waivedByUid });
  },

  /**
   * Stop a charge for teaching that is not going to happen:
   * `scheduled → cancelled`. Separate from `waived` on purpose — "we are not
   * charging for this" and "this is not happening" are different facts.
   */
  async tryCancel(id: string): Promise<LessonScheduledCharge | undefined> {
    return tryTerminate(id, 'cancelled');
  },
};
