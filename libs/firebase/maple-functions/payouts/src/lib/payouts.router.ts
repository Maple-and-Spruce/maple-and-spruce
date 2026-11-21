/**
 * payouts — what M&S owes the people it pays, as one Cloud Function (ADR-029).
 *
 * Three kinds of payee:
 * - Class instructors are paid by statement, made whenever David chooses
 *   (per class, weekly, monthly), covering the finished class sessions no
 *   earlier statement has claimed (see `class-instructor-payout.ts` in the
 *   domain lib for the policy).
 * - Consigning artists are paid for their sales (`artist-payouts.ts`).
 * - Lesson teachers' earnings are reported, not yet recorded
 *   (`teacher-payouts.ts`).
 *
 * The app never moves money. It computes what is owed, and David records the
 * Square Payroll / Bill Pay payment he made against it.
 *
 * Every route spells out `requiringRole(Role.Admin)` rather than sharing a
 * helper: `tools/check-callable-roles.ts` reads the gate off the AST and
 * cannot see through a helper. Payouts are finance, so they are admin-only.
 */
import {
  Functions,
  Role,
  throwFailedPrecondition,
  throwInvalidArgument,
  throwNotFound,
} from '@maple/firebase/functions';
import {
  ClassInstructorStatementRepository,
  ClassRepository,
  RegistrationRepository,
  type StatementTransitionOutcome,
} from '@maple/firebase/database';
import {
  instructorReadiness,
  isPayoutDay,
  monthKeyInStudioZone,
  paidTotalForYear,
  paidTotalsByYear,
  statementStaleReasons,
  zonedDateKey,
  type ClassInstructorStatement,
} from '@maple/ts/domain';
import {
  generateClassInstructorStatementValidation,
  markClassInstructorStatementPaidValidation,
} from '@maple/ts/validation';
import type {
  GeneratePayoutRequest,
  GeneratePayoutResponse,
  GetPayoutsRequest,
  GetPayoutsResponse,
  GetTeacherPayoutsRequest,
  GetTeacherPayoutsResponse,
  MarkPayoutPaidRequest,
  MarkPayoutPaidResponse,
  GenerateClassInstructorStatementRequest,
  GenerateClassInstructorStatementResponse,
  GetClassInstructorStatementRequest,
  GetClassInstructorStatementResponse,
  GetClassInstructorStatementsRequest,
  GetClassInstructorStatementsResponse,
  MarkClassInstructorStatementPaidRequest,
  MarkClassInstructorStatementPaidResponse,
  PreviewClassInstructorPayoutsRequest,
  PreviewClassInstructorPayoutsResponse,
  VoidClassInstructorStatementRequest,
  VoidClassInstructorStatementResponse,
} from '@maple/ts/firebase/api-types';
import { buildDrafts, buildPreviews, loadPayoutMonthData } from './class-instructor-payout-data';
import {
  generateArtistPayout,
  getArtistPayouts,
  markArtistPayoutPaid,
} from './artist-payouts';
import { getTeacherPayouts } from './teacher-payouts';

function unwrap(outcome: StatementTransitionOutcome, id: string, verb: string): ClassInstructorStatement {
  if (outcome.kind === 'not-found') throwNotFound('Statement', id);
  if (outcome.kind === 'wrong-status') {
    throwFailedPrecondition(`Only a pending statement can be ${verb}; this one is ${outcome.status}`);
  }
  return outcome.statement;
}

export const payouts = Functions.router('payouts', {
  previewClassInstructorPayouts: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<PreviewClassInstructorPayoutsRequest, PreviewClassInstructorPayoutsResponse>(
      async (data) => {
        if (data.throughDate !== undefined && !isPayoutDay(data.throughDate)) {
          throwInvalidArgument('Through date must be YYYY-MM-DD');
        }
        const now = new Date();
        const [monthData, statements] = await Promise.all([
          loadPayoutMonthData(monthKeyInStudioZone(now)),
          ClassInstructorStatementRepository.findAll(),
        ]);
        const drafts = await buildDrafts(monthData, now, data.throughDate);
        return {
          previews: buildPreviews(drafts, statements, monthData.instructors, now),
          ...(data.throughDate !== undefined && { throughDate: data.throughDate }),
        };
      }
    ),

  generateClassInstructorStatement: Functions.endpoint
    .requiringRole(Role.Admin)
    .validating(generateClassInstructorStatementValidation)
    .asRoute<GenerateClassInstructorStatementRequest, GenerateClassInstructorStatementResponse>(
      async (data) => {
        const now = new Date();
        const monthData = await loadPayoutMonthData(
          monthKeyInStudioZone(now),
          data.instructorId
        );
        if (monthData.instructors.length === 0) throwNotFound('Instructor', data.instructorId);

        // Only sessions that have ended, and that no statement has claimed.
        const [draft] = await buildDrafts(monthData, now, data.throughDate);
        if (!draft || draft.entries.length === 0) {
          throwFailedPrecondition(
            data.throughDate
              ? `Nothing unpaid for this instructor up to ${data.throughDate}`
              : 'Nothing unpaid for this instructor yet'
          );
        }
        if (draft.missingRateConfig || draft.payRate === undefined) {
          throwFailedPrecondition(
            'This instructor has no percentage pay rate; set one on their profile first'
          );
        }
        if (draft.totalOwedCents <= 0) {
          throwFailedPrecondition(
            'Refund adjustments cancel out what is owed so far; they carry to the next statement'
          );
        }

        // The transaction refuses if any of these sessions was claimed since
        // the draft was built, so a double click or two admins cannot pay a
        // session twice.
        const outcome = await ClassInstructorStatementRepository.generate({
          ...draft,
          payRate: draft.payRate,
        });
        if (outcome.kind === 'already-claimed') {
          throwFailedPrecondition(
            'Some of these sessions were just put on another statement; refresh and try again'
          );
        }
        return { statement: outcome.statement };
      }
    ),

  getClassInstructorStatements: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetClassInstructorStatementsRequest, GetClassInstructorStatementsResponse>(
      async (data) => {
        const statements = await ClassInstructorStatementRepository.findAll({
          instructorId: data.instructorId,
          month: data.month,
          status: data.status,
        });

        // The year total needs every paid statement, not just the filtered page.
        const year = Number(zonedDateKey(new Date()).slice(0, 4));
        const paid = await ClassInstructorStatementRepository.findAll({ status: 'paid' });
        const paidThisYearByInstructor: Record<string, number> = {};
        const paidByYearByInstructor: Record<string, Record<string, number>> = {};
        for (const instructorId of new Set(paid.map((s) => s.instructorId))) {
          paidThisYearByInstructor[instructorId] = paidTotalForYear(paid, instructorId, year);
          paidByYearByInstructor[instructorId] = paidTotalsByYear(paid, instructorId);
        }

        return { statements, paidThisYearByInstructor, paidByYearByInstructor };
      }
    ),

  getClassInstructorStatement: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetClassInstructorStatementRequest, GetClassInstructorStatementResponse>(
      async (data) => {
        if (!data.id) throwInvalidArgument('Statement ID is required');
        const statement = await ClassInstructorStatementRepository.findById(data.id);
        if (!statement) throwNotFound('Statement', data.id);

        if (statement.status !== 'pending') return { statement, staleReasons: [] };

        const classIds = statement.classes.map((c) => c.classId);
        const [classes, registrations] = await Promise.all([
          Promise.all(classIds.map((id) => ClassRepository.findById(id))),
          Promise.all(classIds.map((id) => RegistrationRepository.findByClassId(id))),
        ]);
        return {
          statement,
          staleReasons: statementStaleReasons(
            statement,
            classes.filter((c) => c !== undefined),
            registrations.flat()
          ),
        };
      }
    ),

  markClassInstructorStatementPaid: Functions.endpoint
    .requiringRole(Role.Admin)
    .validating(markClassInstructorStatementPaidValidation)
    .asRoute<MarkClassInstructorStatementPaidRequest, MarkClassInstructorStatementPaidResponse>(
      async (data) => {
        const outcome = await ClassInstructorStatementRepository.markPaid(data.id, {
          paidOn: data.paidOn,
          paymentMethod: data.paymentMethod,
          paymentReference: data.paymentReference?.trim() || undefined,
        });
        return { statement: unwrap(outcome, data.id, 'marked paid') };
      }
    ),

  voidClassInstructorStatement: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<VoidClassInstructorStatementRequest, VoidClassInstructorStatementResponse>(
      async (data) => {
        if (!data.id) throwInvalidArgument('Statement ID is required');
        const outcome = await ClassInstructorStatementRepository.void(data.id);
        return { statement: unwrap(outcome, data.id, 'voided') };
      }
    ),

  getArtistPayouts: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetPayoutsRequest, GetPayoutsResponse>(getArtistPayouts),

  generateArtistPayout: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GeneratePayoutRequest, GeneratePayoutResponse>(generateArtistPayout),

  markArtistPayoutPaid: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<MarkPayoutPaidRequest, MarkPayoutPaidResponse>(markArtistPayoutPaid),

  getTeacherPayouts: Functions.endpoint
    .requiringRole(Role.Admin)
    .asRoute<GetTeacherPayoutsRequest, GetTeacherPayoutsResponse>(getTeacherPayouts),
});
