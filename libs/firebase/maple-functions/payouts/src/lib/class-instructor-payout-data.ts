/**
 * Loads what `buildClassInstructorStatementDraft` needs for a month:
 * instructors, the classes with a session that month (or an earlier one back
 * to the payout start month) and their registrations, any refunded
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
  buildClassInstructorStatementDraft,
  isInStatementWindow,
  monthKeyInStudioZone,
  type Class,
  type ClassInstructorStatementDraft,
  type Instructor,
  type Registration,
} from '@maple/ts/domain';

export interface PayoutMonthData {
  instructors: Instructor[];
  classes: Class[];
  registrationsByClass: Record<string, Registration[]>;
  /**
   * Instructors left out because they aren't contract instructors (the owner,
   * staff): their classes are all M&S's, so there is nothing to pay them.
   */
  nonContractorIds: string[];
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

  // Only contract instructors are paid a share. A class taught by the owner or
  // staff is entirely M&S's, so it never reaches a statement or a preview.
  const contractors = allInstructors.filter((i) => i.isContractor === true);
  const contractorIds = new Set(contractors.map((i) => i.id));
  const taught = allClasses.filter(
    (c) => c.instructorId && contractorIds.has(c.instructorId)
  );
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
    instructors: contractors,
    classes: [...inWindow, ...reachedBack],
    registrationsByClass,
    nonContractorIds: allInstructors
      .filter((i) => i.isContractor !== true)
      .map((i) => i.id),
  };
}

/** One draft per instructor who taught in the window. */
export async function buildDrafts(
  month: string,
  data: PayoutMonthData,
  now: Date
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
      buildClassInstructorStatementDraft({
        instructor,
        month,
        classes: data.classes,
        registrationsByClass: data.registrationsByClass,
        existingEntries,
        paidStatementIds,
        now,
      })
    );
}
