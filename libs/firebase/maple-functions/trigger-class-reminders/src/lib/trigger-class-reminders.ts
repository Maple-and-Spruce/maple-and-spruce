/**
 * triggerClassReminders — the admin-callable twin of the `sendClassReminders`
 * schedule.
 *
 * Why this exists:
 *   - Manual catch-up if the daily schedule ever misfires (e.g. CloudScheduler
 *     pause/incident). Katie can run it from the admin UI to bring everyone
 *     who should have been reminded today back into compliance.
 *   - Drives integration tests — `onSchedule` triggers aren't reachable via
 *     HTTP in the Firebase emulator, but admin-callable HTTPS triggers are.
 *
 * It lives in its own library because **one library deploys exactly one Cloud
 * Function** — CI derives the deploy filter from the library directory name, so
 * a second export co-located with the schedule would simply never be deployed
 * (legacy #872).
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  runSendClassReminders,
  type SendClassRemindersResult,
} from '@maple/firebase/maple-functions/send-class-reminders';

export const triggerClassReminders = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<Record<string, never>, SendClassRemindersResult>(async () => {
    return runSendClassReminders(new Date());
  });
