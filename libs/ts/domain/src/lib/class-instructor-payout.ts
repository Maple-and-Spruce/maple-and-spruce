/**
 * Class-instructor payouts: what M&S owes a contract instructor for the
 * classes they taught in a month.
 *
 * Policy (David, 2026-09-29):
 * - The instructor earns `payRate` (e.g. 0.8) of what the student paid for
 *   the class — after discounts, before sales tax (`subtotalCents`). M&S
 *   absorbs the card fee.
 * - Revenue is split evenly across a class's sessions, and each session is
 *   paid in the month (studio time) it was held. A class running Oct 28 and
 *   Nov 4 lands half on October's statement and half on November's.
 * - A registration earns a share whenever M&S kept the money: `confirmed`,
 *   `no-show`, or `cancelled` without a refund.
 * - A refund before the statement is marked paid means void and regenerate
 *   (the statement reads as stale). A refund after it is paid comes off the
 *   next statement as a negative adjustment.
 *
 * Nothing here moves money. David pays instructors outside the app and
 * records it on the statement.
 *
 * Double payment is prevented by the ledger: every payable unit has a
 * deterministic id (`classSessionEntryId`, `classRefundEntryId`), and the
 * generate transaction refuses to write an id that already exists. This
 * module decides which ids a statement would claim; it never writes.
 */
import type { Class } from './class';
import { getSessionEndTime, getSortedSessions } from './class';
import type { Instructor } from './instructor';
import type { Registration } from './registration';
import { zonedDateKey } from './schedule-format';

/**
 * Sessions before this month are never swept onto a statement, so the first
 * statement doesn't pay out all of history.
 */
export const CLASS_INSTRUCTOR_PAYOUTS_START_MONTH = '2026-09';

// ── Ledger ────────────────────────────────────────────────────────────

export type PayoutLedgerEntryKind = 'class-session' | 'class-refund';

/**
 * One payable unit, claimed by exactly one statement. The document id is
 * deterministic, which is what makes paying it twice impossible.
 */
export interface PayoutLedgerEntry {
  id: string;
  kind: PayoutLedgerEntryKind;
  payeeType: 'instructor';
  payeeId: string;
  statementId: string;
  classId: string;
  registrationId: string;
  /** Index into the class's sessions, sorted earliest-first. `class-session` only. */
  sessionIndex?: number;
  /** When the session started. `class-session` only. */
  sessionAt?: Date;
  /** Class revenue attributed to this unit (0 for refunds). */
  revenueCents: number;
  /** What the instructor is owed for this unit; negative for refunds. */
  shareCents: number;
  createdAt: Date;
}

/** A ledger entry as the builder proposes it, before a statement owns it. */
export type ProposedLedgerEntry = Omit<PayoutLedgerEntry, 'statementId' | 'createdAt'>;

export function classSessionEntryId(registrationId: string, sessionIndex: number): string {
  return `class-session_${registrationId}_${sessionIndex}`;
}

export function classRefundEntryId(registrationId: string): string {
  return `class-refund_${registrationId}`;
}

// ── Statement ─────────────────────────────────────────────────────────

export type ClassInstructorStatementStatus = 'pending' | 'paid' | 'void';

/** How David paid the instructor, outside the app. */
export type ClassInstructorPaymentMethod = 'payroll' | 'bill-pay' | 'other';

export const CLASS_INSTRUCTOR_PAYMENT_METHOD_LABELS: Record<
  ClassInstructorPaymentMethod,
  string
> = {
  payroll: 'Square Payroll',
  'bill-pay': 'Square Bill Pay',
  other: 'Other',
};

/** One class on a statement, summarised across the sessions it covers. */
export interface StatementClassLine {
  classId: string;
  className: string;
  /** How many sessions the class had when the statement was generated. */
  totalSessions: number;
  /** The sessions this statement pays for, earliest first. */
  sessions: { index: number; at: Date }[];
  /** True when any session here was held before the statement's month. */
  includesEarlierMonths: boolean;
  /** Attendees (sum of `quantity`) across the registrations paid here. */
  headcount: number;
  registrationIds: string[];
  grossCents: number;
  shareCents: number;
}

export interface StatementAdjustment {
  kind: 'refund';
  registrationId: string;
  classId: string;
  className: string;
  refundedAt?: Date;
  /** Negative: the share already paid for this registration. */
  shareCents: number;
}

export interface ClassInstructorStatementDraft {
  instructorId: string;
  instructorName: string;
  /** The rate applied; undefined when the instructor has no percentage rate. */
  payRate?: number;
  /** `YYYY-MM` */
  month: string;
  classes: StatementClassLine[];
  adjustments: StatementAdjustment[];
  grossCents: number;
  shareCents: number;
  adjustmentsCents: number;
  totalOwedCents: number;
  /** True when the instructor isn't on a percentage rate; shares are 0 and generate refuses. */
  missingRateConfig: boolean;
  /** The ledger entries a statement generated from this draft would claim. */
  entries: ProposedLedgerEntry[];
}

export interface ClassInstructorStatement
  extends Omit<ClassInstructorStatementDraft, 'entries' | 'missingRateConfig' | 'payRate'> {
  id: string;
  payRate: number;
  status: ClassInstructorStatementStatus;
  /** Ledger entry ids this statement owns. */
  entryIds: string[];
  /** `YYYY-MM-DD`, the day David paid it. */
  paidOn?: string;
  paymentMethod?: ClassInstructorPaymentMethod;
  paymentReference?: string;
  voidedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Month helpers ─────────────────────────────────────────────────────

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPayoutMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_PATTERN.test(value);
}

/** `YYYY-MM` for an instant, read in the studio's timezone. */
export function monthKeyInStudioZone(instant: Date): string {
  return zonedDateKey(instant).slice(0, 7);
}

/** True once every day of `month` is in the past, in studio time. */
export function isPayoutMonthOver(month: string, now: Date): boolean {
  return monthKeyInStudioZone(now) > month;
}

// ── Money ─────────────────────────────────────────────────────────────

/** Whether M&S kept this registration's money, and so owes the instructor a share. */
export function registrationEarnsInstructorShare(registration: Registration): boolean {
  switch (registration.status) {
    case 'confirmed':
    case 'no-show':
      return true;
    case 'cancelled':
      return !registration.refundedAt;
    default:
      return false;
  }
}

/**
 * Split `totalCents` evenly across `sessionCount` sessions. The parts
 * always sum to the total; the remainder goes to the last session.
 */
export function prorateAcrossSessions(totalCents: number, sessionCount: number): number[] {
  if (sessionCount <= 0) return [];
  const base = Math.floor(totalCents / sessionCount);
  const parts = Array.from({ length: sessionCount }, () => base);
  parts[sessionCount - 1] += totalCents - base * sessionCount;
  return parts;
}

/**
 * The instructor's share for session `index` of `sessionCount`.
 *
 * Computed cumulatively so the shares across every session sum to exactly
 * `round(totalCents × rate)`, however the sessions fall across months.
 */
export function sessionShareCents(
  totalCents: number,
  rate: number,
  sessionCount: number,
  index: number
): number {
  const upTo = (k: number) => Math.round((totalCents * rate * k) / sessionCount);
  return upTo(index + 1) - upTo(index);
}

function percentageRate(instructor: Instructor): number | undefined {
  if (instructor.payRateType !== 'percentage') return undefined;
  if (instructor.payRate === undefined || instructor.payRate === null) return undefined;
  return instructor.payRate;
}

// ── Builder ───────────────────────────────────────────────────────────

export interface BuildClassInstructorStatementInput {
  instructor: Instructor;
  /** `YYYY-MM` */
  month: string;
  /** Classes to consider. Classes taught by someone else are ignored. */
  classes: Class[];
  /** Registrations for those classes, keyed by class id. */
  registrationsByClass: Record<string, Registration[]>;
  /** Ledger entries that already exist for those registrations, on any statement. */
  existingEntries: PayoutLedgerEntry[];
  /** Ids of statements that have been marked paid. */
  paidStatementIds: ReadonlySet<string>;
  now: Date;
  /** Defaults to `CLASS_INSTRUCTOR_PAYOUTS_START_MONTH`. */
  startMonth?: string;
}

/**
 * Everything the instructor is owed for `month` that no statement has
 * claimed yet:
 * - sessions held in `month` that have ended;
 * - earlier sessions nobody claimed (a registration entered late), back to
 *   `startMonth`;
 * - negative adjustments for registrations refunded after a paid statement.
 */
export function buildClassInstructorStatementDraft(
  input: BuildClassInstructorStatementInput
): ClassInstructorStatementDraft {
  const { instructor, month, now } = input;
  const startMonth = input.startMonth ?? CLASS_INSTRUCTOR_PAYOUTS_START_MONTH;
  const rate = percentageRate(instructor);
  const existingIds = new Set(input.existingEntries.map((e) => e.id));

  const entries: ProposedLedgerEntry[] = [];
  const classes: StatementClassLine[] = [];
  const adjustments: StatementAdjustment[] = [];

  const ownClasses = input.classes
    .filter((c) => c.instructorId === instructor.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const classEntity of ownClasses) {
    const registrations = input.registrationsByClass[classEntity.id] ?? [];

    if (classEntity.status !== 'cancelled') {
      const line = buildClassLine(classEntity, registrations, {
        instructorId: instructor.id,
        month,
        startMonth,
        rate,
        now,
        existingIds,
        entries,
      });
      if (line) classes.push(line);
    }

    for (const registration of registrations) {
      const adjustment = refundAdjustment(
        classEntity,
        registration,
        input.existingEntries,
        input.paidStatementIds,
        existingIds
      );
      if (!adjustment) continue;
      adjustments.push(adjustment);
      entries.push({
        id: classRefundEntryId(registration.id),
        kind: 'class-refund',
        payeeType: 'instructor',
        payeeId: instructor.id,
        classId: classEntity.id,
        registrationId: registration.id,
        revenueCents: 0,
        shareCents: adjustment.shareCents,
      });
    }
  }

  const grossCents = sum(classes.map((c) => c.grossCents));
  const shareCents = sum(classes.map((c) => c.shareCents));
  const adjustmentsCents = sum(adjustments.map((a) => a.shareCents));

  return {
    instructorId: instructor.id,
    instructorName: instructor.name,
    payRate: rate,
    month,
    classes,
    adjustments,
    grossCents,
    shareCents,
    adjustmentsCents,
    totalOwedCents: shareCents + adjustmentsCents,
    missingRateConfig: rate === undefined,
    entries,
  };
}

function buildClassLine(
  classEntity: Class,
  registrations: Registration[],
  ctx: {
    instructorId: string;
    month: string;
    startMonth: string;
    rate: number | undefined;
    now: Date;
    existingIds: Set<string>;
    entries: ProposedLedgerEntry[];
  }
): StatementClassLine | undefined {
  const sessions = getSortedSessions(classEntity);
  const sessionCount = sessions.length;
  if (sessionCount === 0) return undefined;

  const sessionsHere = new Map<number, Date>();
  const registrationIds = new Set<string>();
  let headcount = 0;
  let grossCents = 0;
  let shareCents = 0;

  for (const registration of registrations) {
    if (!registrationEarnsInstructorShare(registration)) continue;
    const revenueParts = prorateAcrossSessions(registration.subtotalCents, sessionCount);
    let counted = false;

    sessions.forEach((session, index) => {
      const at = new Date(session.dateTime);
      const sessionMonth = monthKeyInStudioZone(at);
      if (sessionMonth > ctx.month || sessionMonth < ctx.startMonth) return;
      if (getSessionEndTime(session, classEntity.durationMinutes) > ctx.now) return;
      const id = classSessionEntryId(registration.id, index);
      if (ctx.existingIds.has(id)) return;

      const revenueCents = revenueParts[index];
      const share =
        ctx.rate === undefined
          ? 0
          : sessionShareCents(registration.subtotalCents, ctx.rate, sessionCount, index);

      ctx.entries.push({
        id,
        kind: 'class-session',
        payeeType: 'instructor',
        payeeId: ctx.instructorId,
        classId: classEntity.id,
        registrationId: registration.id,
        sessionIndex: index,
        sessionAt: at,
        revenueCents,
        shareCents: share,
      });
      sessionsHere.set(index, at);
      grossCents += revenueCents;
      shareCents += share;
      counted = true;
    });

    if (counted) {
      registrationIds.add(registration.id);
      headcount += registration.quantity;
    }
  }

  if (registrationIds.size === 0) return undefined;

  const orderedSessions = [...sessionsHere.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, at]) => ({ index, at }));

  return {
    classId: classEntity.id,
    className: classEntity.name,
    totalSessions: sessionCount,
    sessions: orderedSessions,
    includesEarlierMonths: orderedSessions.some(
      (s) => monthKeyInStudioZone(s.at) < ctx.month
    ),
    headcount,
    registrationIds: [...registrationIds],
    grossCents,
    shareCents,
  };
}

/**
 * A refunded registration whose sessions were paid on a statement that has
 * since been marked paid, and that has no refund adjustment yet. It gives
 * back exactly what was paid for it.
 */
function refundAdjustment(
  classEntity: Class,
  registration: Registration,
  existingEntries: PayoutLedgerEntry[],
  paidStatementIds: ReadonlySet<string>,
  existingIds: Set<string>
): StatementAdjustment | undefined {
  if (registrationEarnsInstructorShare(registration)) return undefined;
  if (registration.status !== 'refunded' && !registration.refundedAt) return undefined;
  if (existingIds.has(classRefundEntryId(registration.id))) return undefined;

  const paidShare = sum(
    existingEntries
      .filter(
        (e) =>
          e.kind === 'class-session' &&
          e.registrationId === registration.id &&
          paidStatementIds.has(e.statementId)
      )
      .map((e) => e.shareCents)
  );
  if (paidShare === 0) return undefined;

  return {
    kind: 'refund',
    registrationId: registration.id,
    classId: classEntity.id,
    className: classEntity.name,
    refundedAt: registration.refundedAt,
    shareCents: -paidShare,
  };
}

// ── Stale check ───────────────────────────────────────────────────────

export type StatementStaleReason =
  | { kind: 'registration-no-longer-earns'; classId: string; registrationId: string; status: Registration['status'] }
  | { kind: 'sessions-changed'; classId: string; was: number; now: number };

/**
 * Why a pending statement no longer matches the data — a registration on it
 * was refunded, or a class's sessions were edited. The fix is to void and
 * regenerate. Paid and void statements are never stale: refunds after
 * payment are handled as next month's adjustment.
 */
export function statementStaleReasons(
  statement: Pick<ClassInstructorStatement, 'status' | 'classes'>,
  classes: Class[],
  registrations: Registration[]
): StatementStaleReason[] {
  if (statement.status !== 'pending') return [];
  const classById = new Map(classes.map((c) => [c.id, c]));
  const registrationById = new Map(registrations.map((r) => [r.id, r]));
  const reasons: StatementStaleReason[] = [];

  for (const line of statement.classes) {
    const current = classById.get(line.classId);
    if (current && current.sessions.length !== line.totalSessions) {
      reasons.push({
        kind: 'sessions-changed',
        classId: line.classId,
        was: line.totalSessions,
        now: current.sessions.length,
      });
    }
    for (const registrationId of line.registrationIds) {
      const registration = registrationById.get(registrationId);
      if (registration && !registrationEarnsInstructorShare(registration)) {
        reasons.push({
          kind: 'registration-no-longer-earns',
          classId: line.classId,
          registrationId,
          status: registration.status,
        });
      }
    }
  }
  return reasons;
}

// ── Year total ────────────────────────────────────────────────────────

/**
 * What an instructor was paid in a calendar year, by the day David paid it.
 * This is the figure checked against the 1099-NEC threshold.
 */
export function paidTotalForYear(
  statements: ClassInstructorStatement[],
  instructorId: string,
  year: number
): number {
  return sum(
    statements
      .filter(
        (s) =>
          s.instructorId === instructorId &&
          s.status === 'paid' &&
          s.paidOn?.startsWith(`${year}-`)
      )
      .map((s) => s.totalOwedCents)
  );
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
