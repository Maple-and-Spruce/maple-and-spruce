/**
 * lessonPayments — taking lesson payments in Square, as one Cloud Function in
 * `maple-square` (ADR-029, #67). Admin-only on every route.
 *
 * Every route already held the same Square access token and strings as its
 * own function, so sharing one widens nothing. The rest of the lesson
 * endpoints are on the `lessons` router in `maple-core`; these stay apart
 * because they need the Square SDK and its secrets, and a router is per
 * codebase.
 *
 * Two routes move money:
 * - `chargeLessonsNow` takes a payment on the spot. The charge record at its
 *   deterministic id is claimed before the payment, so a double click cannot
 *   take a second one.
 * - `triggerLessonBilling` runs the billing pass by hand. It deliberately
 *   ignores `LESSON_AUTOPAY_PAUSED`: it is the manual "run billing" override
 *   (ADR-034). Pass `dryRun` to plan without charging.
 *
 * The daily `runLessonBilling` schedule is not here: a schedule can't be a
 * route.
 *
 * Each route spells its gate and secrets out in full:
 * `tools/check-callable-roles.ts` reads `requiringRole` off the AST and cannot
 * see through a helper.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import type {
  ChargeLessonsNowRequest,
  ChargeLessonsNowResponse,
  GetSquareCardCandidatesRequest,
  GetSquareCardCandidatesResponse,
  RunLessonBillingRequest,
  RunLessonBillingResult,
  UpdateStudentSquareCardRequest,
  UpdateStudentSquareCardResponse,
} from '@maple/ts/firebase/api-types';
import { chargeLessonsNow } from './charge-lessons-now';
import { getSquareCardCandidates } from './get-square-card-candidates';
import { triggerLessonBilling } from './trigger-lesson-billing';
import { updateStudentSquareCard } from './update-student-square-card';

export const lessonPayments = Functions.router('lessonPayments', {
  chargeLessonsNow: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<ChargeLessonsNowRequest, ChargeLessonsNowResponse>(
      chargeLessonsNow
    ),

  triggerLessonBilling: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<RunLessonBillingRequest, RunLessonBillingResult>(
      triggerLessonBilling
    ),

  /** The cards already on file in Square, to match one to a student. Links nothing. */
  getSquareCardCandidates: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<GetSquareCardCandidatesRequest, GetSquareCardCandidatesResponse>(
      getSquareCardCandidates
    ),

  updateStudentSquareCard: Functions.endpoint
    .requiringRole(Role.Admin)
    .usingSecrets(...SQUARE_SECRET_NAMES)
    .usingStrings(...SQUARE_STRING_NAMES)
    .asRoute<UpdateStudentSquareCardRequest, UpdateStudentSquareCardResponse>(
      updateStudentSquareCard
    ),
});
