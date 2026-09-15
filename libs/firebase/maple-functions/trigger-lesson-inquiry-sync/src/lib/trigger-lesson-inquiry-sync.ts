/**
 * triggerLessonInquirySync — the admin-callable twin of the
 * `syncLessonInquiries` schedule (#795).
 *
 * Same logic on demand, and what the integration tests drive: `onSchedule` is
 * not callable over HTTP in the Firebase emulator, an admin HTTPS endpoint is.
 *
 * It lives in its own library because **one library deploys exactly one Cloud
 * Function** — CI derives the deploy filter from the library directory name, so
 * a second export co-located with the schedule would simply never be deployed
 * (#872).
 */
import { Functions, Role } from '@maple/firebase/functions';
import {
  parseFormIds,
  runSyncLessonInquiries,
  TALLY_SECRET_NAMES,
  TALLY_STRING_NAMES,
  type SyncLessonInquiriesResult,
} from '@maple/firebase/maple-functions/sync-lesson-inquiries';

export const triggerLessonInquirySync = Functions.endpoint
  .usingSecrets(...TALLY_SECRET_NAMES)
  .usingStrings(...TALLY_STRING_NAMES)
  .requiringRole(Role.Admin)
  .handle<Record<string, never>, SyncLessonInquiriesResult>(
    async (_data, _context, secrets, strings) => {
      return runSyncLessonInquiries(
        {
          // The builder resolves secrets and strings before the handler runs,
          // so these are plain values, not params.
          baseUrl: strings.TALLY_API_BASE_URL,
          apiKey: secrets.TALLY_API_KEY,
          formIds: parseFormIds(strings.TALLY_LESSON_INQUIRY_FORM_IDS),
        },
        new Date()
      );
    }
  );
