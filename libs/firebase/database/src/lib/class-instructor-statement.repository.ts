/**
 * Class-instructor payout statements and the ledger that keeps them honest.
 *
 * `payoutLedgerEntries` holds one document per payable unit, at a
 * deterministic id (`class-session_{registrationId}_{sessionIndex}`,
 * `class-refund_{registrationId}`). Generating a statement writes the
 * statement and all of its entries in one transaction, and the transaction
 * refuses if any entry already exists. So a session can never be paid twice,
 * even when two admins press Generate at the same moment. Artist payouts
 * get the same guarantee differently: a sale is claimed by its `payoutId`
 * stamp, written in the payout's own transaction (`PayoutRepository.generate`).
 *
 * Voiding a pending statement deletes its entries in the same transaction,
 * which releases them to be claimed again.
 */
import type {
  ClassInstructorPaymentMethod,
  ClassInstructorStatement,
  ClassInstructorStatementDraft,
  ClassInstructorStatementStatus,
  PayoutLedgerEntry,
  PayoutLedgerEntryKind,
  StatementAdjustment,
  StatementClassLine,
} from '@maple/ts/domain';
import { db, getDb, toDate } from './utilities/database.config';

const STATEMENTS = 'classInstructorStatements';
const LEDGER = 'payoutLedgerEntries';
/** Firestore caps an `in` filter at 30 values. */
const IN_LIMIT = 30;

function docToLedgerEntry(doc: FirebaseFirestore.DocumentSnapshot): PayoutLedgerEntry | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    kind: data.kind as PayoutLedgerEntryKind,
    payeeType: 'instructor',
    payeeId: data.payeeId,
    statementId: data.statementId,
    classId: data.classId,
    registrationId: data.registrationId,
    sessionIndex: data.sessionIndex ?? undefined,
    sessionAt: data.sessionAt ? toDate(data.sessionAt) : undefined,
    revenueCents: data.revenueCents,
    shareCents: data.shareCents,
    createdAt: toDate(data.createdAt),
  };
}

function toClassLine(raw: Record<string, unknown>): StatementClassLine {
  return {
    classId: raw['classId'] as string,
    className: raw['className'] as string,
    totalSessions: raw['totalSessions'] as number,
    sessions: ((raw['sessions'] as { index: number; at: unknown }[]) ?? []).map((s) => ({
      index: s.index,
      at: toDate(s.at),
    })),
    includesEarlierMonths: Boolean(raw['includesEarlierMonths']),
    headcount: raw['headcount'] as number,
    registrationIds: (raw['registrationIds'] as string[]) ?? [],
    grossCents: raw['grossCents'] as number,
    shareCents: raw['shareCents'] as number,
  };
}

function toAdjustment(raw: Record<string, unknown>): StatementAdjustment {
  return {
    kind: 'refund',
    registrationId: raw['registrationId'] as string,
    classId: raw['classId'] as string,
    className: raw['className'] as string,
    refundedAt: raw['refundedAt'] ? toDate(raw['refundedAt']) : undefined,
    shareCents: raw['shareCents'] as number,
  };
}

function docToStatement(doc: FirebaseFirestore.DocumentSnapshot): ClassInstructorStatement | undefined {
  if (!doc.exists) return undefined;
  const data = doc.data()!;
  return {
    id: doc.id,
    instructorId: data.instructorId,
    instructorName: data.instructorName,
    payRate: data.payRate,
    month: data.month,
    status: data.status as ClassInstructorStatementStatus,
    classes: ((data.classes as Record<string, unknown>[]) ?? []).map(toClassLine),
    adjustments: ((data.adjustments as Record<string, unknown>[]) ?? []).map(toAdjustment),
    grossCents: data.grossCents,
    shareCents: data.shareCents,
    adjustmentsCents: data.adjustmentsCents,
    totalOwedCents: data.totalOwedCents,
    entryIds: data.entryIds ?? [],
    paidOn: data.paidOn ?? undefined,
    paymentMethod: (data.paymentMethod as ClassInstructorPaymentMethod | null) ?? undefined,
    paymentReference: data.paymentReference ?? undefined,
    voidedAt: data.voidedAt ? toDate(data.voidedAt) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Firestore rejects `undefined`; drop it from nested snapshots. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined)
  ) as T;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface ClassInstructorStatementFilters {
  instructorId?: string;
  month?: string;
  status?: ClassInstructorStatementStatus;
}

/** Why generate refused, when it did. */
export type GenerateStatementOutcome =
  | { kind: 'created'; statement: ClassInstructorStatement }
  | { kind: 'statement-exists'; statementId: string }
  | { kind: 'already-claimed'; entryIds: string[] };

export type StatementTransitionOutcome =
  | { kind: 'ok'; statement: ClassInstructorStatement }
  | { kind: 'not-found' }
  | { kind: 'wrong-status'; status: ClassInstructorStatementStatus };

export const PayoutLedgerRepository = {
  /** Every ledger entry for these registrations, on any statement. */
  async findByRegistrationIds(registrationIds: string[]): Promise<PayoutLedgerEntry[]> {
    const unique = [...new Set(registrationIds)];
    const snapshots = await Promise.all(
      chunk(unique, IN_LIMIT).map((ids) =>
        db.collection(LEDGER).where('registrationId', 'in', ids).get()
      )
    );
    return snapshots
      .flatMap((s) => s.docs)
      .map(docToLedgerEntry)
      .filter((e): e is PayoutLedgerEntry => e !== undefined);
  },
};

export const ClassInstructorStatementRepository = {
  async findById(id: string): Promise<ClassInstructorStatement | undefined> {
    return docToStatement(await db.collection(STATEMENTS).doc(id).get());
  },

  async findByIds(ids: string[]): Promise<ClassInstructorStatement[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const refs = unique.map((id) => db.collection(STATEMENTS).doc(id));
    const docs = await getDb().getAll(...refs);
    return docs.map(docToStatement).filter((s): s is ClassInstructorStatement => s !== undefined);
  },

  /** Newest month first, then by instructor name. Equality filters only, so no composite index. */
  async findAll(filters: ClassInstructorStatementFilters = {}): Promise<ClassInstructorStatement[]> {
    let query: FirebaseFirestore.Query = db.collection(STATEMENTS);
    if (filters.instructorId) query = query.where('instructorId', '==', filters.instructorId);
    if (filters.month) query = query.where('month', '==', filters.month);
    if (filters.status) query = query.where('status', '==', filters.status);
    const snapshot = await query.get();
    return snapshot.docs
      .map(docToStatement)
      .filter((s): s is ClassInstructorStatement => s !== undefined)
      .sort(
        (a, b) =>
          b.month.localeCompare(a.month) || a.instructorName.localeCompare(b.instructorName)
      );
  },

  /**
   * Write the statement and claim its ledger entries, atomically.
   *
   * Refuses when the instructor already has a live statement for the month,
   * or when any entry has been claimed since the draft was built.
   */
  async generate(
    draft: ClassInstructorStatementDraft & { payRate: number }
  ): Promise<GenerateStatementOutcome> {
    const database = getDb();
    const statementRef = database.collection(STATEMENTS).doc();
    const entryRefs = draft.entries.map((e) => database.collection(LEDGER).doc(e.id));
    const sameMonth = database
      .collection(STATEMENTS)
      .where('instructorId', '==', draft.instructorId)
      .where('month', '==', draft.month);

    const outcome = await database.runTransaction<
      Exclude<GenerateStatementOutcome, { kind: 'created' }> | { kind: 'created' }
    >(async (tx) => {
      const existing = (await tx.get(sameMonth)).docs.find(
        (d) => d.data()['status'] !== 'void'
      );
      if (existing) return { kind: 'statement-exists', statementId: existing.id };

      const claimed = entryRefs.length > 0 ? await tx.getAll(...entryRefs) : [];
      const taken = claimed.filter((d) => d.exists).map((d) => d.id);
      if (taken.length > 0) return { kind: 'already-claimed', entryIds: taken };

      const now = new Date();
      tx.create(statementRef, {
        instructorId: draft.instructorId,
        instructorName: draft.instructorName,
        payRate: draft.payRate,
        month: draft.month,
        status: 'pending',
        classes: draft.classes.map(withoutUndefined),
        adjustments: draft.adjustments.map(withoutUndefined),
        grossCents: draft.grossCents,
        shareCents: draft.shareCents,
        adjustmentsCents: draft.adjustmentsCents,
        totalOwedCents: draft.totalOwedCents,
        entryIds: draft.entries.map((e) => e.id),
        paidOn: null,
        paymentMethod: null,
        paymentReference: null,
        voidedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      draft.entries.forEach((entry, i) => {
        const { id: _id, ...rest } = entry;
        tx.create(entryRefs[i], {
          ...withoutUndefined(rest),
          statementId: statementRef.id,
          createdAt: now,
        });
      });
      return { kind: 'created' };
    });

    if (outcome.kind !== 'created') return outcome;
    const statement = await this.findById(statementRef.id);
    if (!statement) throw new Error(`Statement ${statementRef.id} not found after generate`);
    return { kind: 'created', statement };
  },

  /** `pending → paid`. David paid the instructor outside the app. */
  async markPaid(
    id: string,
    payment: { paidOn: string; paymentMethod: ClassInstructorPaymentMethod; paymentReference?: string }
  ): Promise<StatementTransitionOutcome> {
    return transition(id, (tx, ref) =>
      tx.update(ref, {
        status: 'paid',
        paidOn: payment.paidOn,
        paymentMethod: payment.paymentMethod,
        paymentReference: payment.paymentReference ?? null,
        updatedAt: new Date(),
      })
    );
  },

  /** `pending → void`, releasing its ledger entries so they can be claimed again. */
  async void(id: string): Promise<StatementTransitionOutcome> {
    return transition(id, (tx, ref, statement) => {
      for (const entryId of statement.entryIds) {
        tx.delete(getDb().collection(LEDGER).doc(entryId));
      }
      const now = new Date();
      tx.update(ref, { status: 'void', voidedAt: now, updatedAt: now });
    });
  },
};

/** Run a change against a statement that must still be `pending`. */
async function transition(
  id: string,
  apply: (
    tx: FirebaseFirestore.Transaction,
    ref: FirebaseFirestore.DocumentReference,
    statement: ClassInstructorStatement
  ) => void
): Promise<StatementTransitionOutcome> {
  const database = getDb();
  const ref = database.collection(STATEMENTS).doc(id);
  const result = await database.runTransaction<StatementTransitionOutcome | { kind: 'applied' }>(
    async (tx) => {
      const statement = docToStatement(await tx.get(ref));
      if (!statement) return { kind: 'not-found' };
      if (statement.status !== 'pending') return { kind: 'wrong-status', status: statement.status };
      apply(tx, ref, statement);
      return { kind: 'applied' };
    }
  );
  if (result.kind !== 'applied') return result;
  const statement = await ClassInstructorStatementRepository.findById(id);
  if (!statement) return { kind: 'not-found' };
  return { kind: 'ok', statement };
}
