/**
 * triggerLessonBilling — the admin-callable twin of the `runLessonBilling`
 * schedule (#81).
 *
 * Manual catch-up, a dry run, and the way integration tests reach the billing
 * run at all: `onSchedule` is not callable over HTTP in the Firebase emulator,
 * an admin HTTPS endpoint is.
 *
 * It lives in its own library because **one library deploys exactly one Cloud
 * Function** — CI derives the deploy filter from the library directory name, so
 * a second export co-located with `runLessonBilling` would simply never be
 * deployed (legacy #872). The billing logic itself stays put; this is a thin wrapper
 * over `executeLessonBilling`.
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  Square,
  SQUARE_SECRET_NAMES,
  SQUARE_STRING_NAMES,
} from '@maple/firebase/square';
import { executeLessonBilling } from '@maple/firebase/maple-functions/run-lesson-billing';
import type {
  RunLessonBillingRequest,
  RunLessonBillingResult,
} from '@maple/ts/firebase/api-types';

export const triggerLessonBilling = Functions.endpoint
  .requiringRole(Role.Admin)
  .usingSecrets(...SQUARE_SECRET_NAMES)
  .usingStrings(...SQUARE_STRING_NAMES)
  .handle<RunLessonBillingRequest, RunLessonBillingResult>(
    async (data, _context, secrets, strings) => {
      const square = new Square(secrets, strings);
      return executeLessonBilling(new Date(), square, {
        dryRun: data?.dryRun === true,
      });
    }
  );
