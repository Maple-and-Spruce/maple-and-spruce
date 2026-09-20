/**
 * triggerMaterializeLessonSchedules — the admin-callable twin of the
 * `materializeLessonSchedules` schedule (legacy #797).
 *
 * Same logic on demand, and what the integration tests drive: `onSchedule` is
 * not callable over HTTP in the Firebase emulator, an admin HTTPS endpoint is.
 *
 * It lives in its own library because **one library deploys exactly one Cloud
 * Function** — CI derives the deploy filter from the library directory name, so
 * a second export co-located with the schedule would simply never be deployed
 * (legacy #872).
 */
import { Functions, Role } from '@maple/firebase/functions';
import { runMaterializeLessonSchedules } from '@maple/firebase/maple-functions/materialize-lesson-schedules';
import type { MaterializeLessonSchedulesResult } from '@maple/ts/firebase/api-types';

export const triggerMaterializeLessonSchedules = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<Record<string, never>, MaterializeLessonSchedulesResult>(async () => {
    return runMaterializeLessonSchedules(new Date());
  });
