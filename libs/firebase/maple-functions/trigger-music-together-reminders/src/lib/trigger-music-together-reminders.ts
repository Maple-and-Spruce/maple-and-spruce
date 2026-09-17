/**
 * triggerMusicTogetherReminders — the admin-callable twin of the
 * `sendMusicTogetherReminders` schedule.
 *
 * Same logic on demand (manual catch-up if the schedule misfires), and what
 * drives the tests: `onSchedule` is not callable over HTTP in the Firebase
 * emulator, an admin HTTPS endpoint is. MT teachers can run it as well as
 * admins, since it is their class list it reminds.
 *
 * It lives in its own library because **one library deploys exactly one Cloud
 * Function** — CI derives the deploy filter from the library directory name, so
 * a second export co-located with the schedule would simply never be deployed
 * (legacy #872).
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  runSendMusicTogetherReminders,
  type SendMusicTogetherRemindersResult,
} from '@maple/firebase/maple-functions/send-music-together-reminders';

export const triggerMusicTogetherReminders = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<Record<string, never>, SendMusicTogetherRemindersResult>(async () => {
    return runSendMusicTogetherReminders(new Date());
  });
