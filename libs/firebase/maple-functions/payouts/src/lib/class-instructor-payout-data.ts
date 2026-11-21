/**
 * Loads what `buildOnDemandStatementDraft` needs: instructors, the classes
 * with a session up to the current month (back to the payout start month)
 * and their registrations, any refunded
 * registration's class, the ledger entries already claimed for those
 * registrations, and which of those entries' statements are paid.
 *
 * Volumes are small (a handful of classes a month), so classes are read
 * whole and filtered in memory rather than adding a date-range index.
 */
import {
  ClassInstructorStatementRepository,
  ClassRepository,
  InstructorRepository,
  PayoutLedgerRepository,
  RegistrationRepository,
} from '@maple/firebase/database';
import {
  buildOnDemandStatementDraft,
  instructorReadiness,
  isInStatementWindow,
  monthKeyInStudioZone,
  paidTotalForYear,
  statementCoverage,
  zonedDateKey,
  type Class,
  type ClassInstructorStatement,
  type ClassInstructorStatementDraft,
  type Instructor,
  type Registration,
} from '@maple/ts/domain';
import type { ClassInstructorPayoutPreview } from '@maple/ts/firebase/api-types';

export interface PayoutMonthData {
  instructors: Instructor[];
  classes: Class[];
  registrationsByClass: Record<string, Registration[]>;
}

/** Whether any of a class's sessions could land on `month`'s statement. */
function taughtInWindow(classEntity: Class, month: string): boolean {
  return classEntity.sessions.some((s) =>
    isInStatementWindow(monthKeyInStudioZone(new Date(s.dateTime)), month)
  );
}

export async function loadPayoutMonthData(
  month: string,
  instructorId?: string
): Promise<PayoutMonthData> {
  const [allInstructors, allClasses, refunded] = await Promise.all([
    instructorId
      ? InstructorRepository.findById(instructorId).then((i) => (i ? [i] : []))
      : InstructorRepository.findAll(),
    ClassRepository.findAll(instructorId ? { instructorId } : undefined),
    RegistrationRepository.findAll({ status: 'refunded' }),
  ]);

  const taught = allClasses.filter((c) => c.instructorId);
  const inWindow = taught.filter((c) => taughtInWindow(c, month));
  const registrations = await Promise.all(
    inWindow.map((c) => RegistrationRepository.findByClassId(c.id))
  );
  const registrationsByClass: Record<string, Registration[]> = {};
  inWindow.forEach((c, i) => {
    registrationsByClass[c.id] = registrations[i];
  });

  // A refund can reach back to a class outside the window (one paid out
  // before the start month, on purpose). Its refunded registrations are all
  // the builder needs to net off what was paid for them.
  const inWindowIds = new Set(inWindow.map((c) => c.id));
  const byId = new Map(taught.map((c) => [c.id, c]));
  const reachedBack: Class[] = [];
  for (const registration of refunded) {
    const classEntity = byId.get(registration.classId);
    if (!classEntity || inWindowIds.has(classEntity.id)) continue;
    if (!registrationsByClass[classEntity.id]) {
      registrationsByClass[classEntity.id] = [];
      reachedBack.push(classEntity);
    }
    registrationsByClass[classEntity.id].push(registration);
  }

  return {
    instructors: allInstructors,
    classes: [...inWindow, ...reachedBack],
    registrationsByClass,
  };
}

/**
 * One draft per instructor who taught in the window: every finished session
 * no statement has claimed, up to `throughDate` when one is given.
 */
export async function buildDrafts(
  data: PayoutMonthData,
  now: Date,
  throughDate?: string
): Promise<ClassInstructorStatementDraft[]> {
  const registrationIds = Object.values(data.registrationsByClass)
    .flat()
    .map((r) => r.id);
  const existingEntries = await PayoutLedgerRepository.findByRegistrationIds(registrationIds);
  const statements = await ClassInstructorStatementRepository.findByIds(
    existingEntries.map((e) => e.statementId)
  );
  const paidStatementIds = new Set(
    statements.filter((s) => s.status === 'paid').map((s) => s.id)
  );

  const teaching = new Set(data.classes.map((c) => c.instructorId));
  return data.instructors
    .filter((i) => teaching.has(i.id))
    .map((instructor) =>
      buildOnDemandStatementDraft({
        instructor,
        classes: data.classes,
        registrationsByClass: data.registrationsByClass,
        existingEntries,
        paidStatementIds,
        now,
        throughDate,
      })
    );
}

/**
 * Where each instructor stands: what no statement has claimed yet (the
 * draft), the statements waiting to be marked paid, and what was paid this
 * year. An instructor shows up when any of the three is non-empty, so one
 * who has been paid in full still reads "$0 owed" rather than disappearing.
 */
export function buildPreviews(
  drafts: ClassInstructorStatementDraft[],
  statements: ClassInstructorStatement[],
  instructors: Instructor[],
  now: Date
): ClassInstructorPayoutPreview[] {
  const year = Number(zonedDateKey(now).slice(0, 4));
  const instructorById = new Map(instructors.map((i) => [i.id, i]));
  const draftById = new Map(drafts.map((d) => [d.instructorId, d]));
  const pending = statements.filter((s) => s.status === 'pending');
  const ids = new Set([
    ...drafts.filter((d) => d.entries.length > 0).map((d) => d.instructorId),
    ...pending.map((s) => s.instructorId),
    ...statements
      .filter((s) => paidTotalForYear([s], s.instructorId, year) !== 0)
      .map((s) => s.instructorId),
  ]);

  return [...ids]
    .map((instructorId): ClassInstructorPayoutPreview => {
      const instructor = instructorById.get(instructorId);
      const own = statements.filter((s) => s.instructorId === instructorId);
      const { entries: _entries, ...draft } =
        draftById.get(instructorId) ?? emptyDraft(instructorId, instructor, own, now);
      const pendingStatements = pending
        .filter((s) => s.instructorId === instructorId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((s) => {
          const coverage = statementCoverage(s);
          return {
            id: s.id,
            totalOwedCents: s.totalOwedCents,
            ...(coverage && { coversFrom: coverage.from, coversTo: coverage.to }),
          };
        });
      const readiness = instructor ? instructorReadiness(instructor) : undefined;
      return {
        ...draft,
        pendingStatements,
        owedCents:
          draft.totalOwedCents + pendingStatements.reduce((t, s) => t + s.totalOwedCents, 0),
        paidThisYearCents: paidTotalForYear(own, instructorId, year),
        // A warning only: generating a statement is unaffected.
        ...(readiness?.kind === 'not-ready' && { readinessMissing: readiness.missing }),
      };
    })
    .sort((a, b) => a.instructorName.localeCompare(b.instructorName));
}

/** An instructor with statements but nothing in the window to draft from. */
function emptyDraft(
  instructorId: string,
  instructor: Instructor | undefined,
  statements: ClassInstructorStatement[],
  now: Date
): ClassInstructorStatementDraft {
  return {
    instructorId,
    instructorName: instructor?.name ?? statements[0]?.instructorName ?? instructorId,
    payRate: instructor?.payRateType === 'percentage' ? instructor.payRate ?? undefined : undefined,
    month: monthKeyInStudioZone(now),
    classes: [],
    adjustments: [],
    grossCents: 0,
    shareCents: 0,
    adjustmentsCents: 0,
    totalOwedCents: 0,
    missingRateConfig: false,
    entries: [],
  };
}
