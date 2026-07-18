/**
 * Send Class Reminders
 *
 * Two exports share the same business logic:
 *   - `sendClassReminders` — scheduled, daily 8:00 AM America/New_York.
 *   - `triggerClassReminders` — admin-only HTTPS callable; runs the
 *     same logic on demand. Useful for manual catch-up if the schedule
 *     ever misfires, and (importantly) gives integration tests a way to
 *     drive the function — the Firebase emulator doesn't expose
 *     `onSchedule` triggers via HTTP. Returns counters so the test can
 *     assert what was queued.
 *
 * Per run:
 *   1. Compute the today window in America/New_York (00:00–23:59 ET).
 *   2. Find every published class with at least one session inside the
 *      window.
 *   3. For each such class, find confirmed registrations and send a single
 *      reminder email per registration per session — keyed by the session's
 *      ISO `dateTime` so multi-session classes get one reminder per session.
 *   4. Stamp `reminderSentForSessions[sessionIso]` after queuing each email
 *      so a second run on the same day is a no-op (run-twice idempotent).
 *
 * Emails are queued via the firestore-send-email extension by writing a doc
 * to the `mail` collection. The Handlebars template body lives in the
 * `email-templates/class-reminder` Firestore doc (seeded by
 * `tools/seed-email-templates.ts`). This function passes the data fields
 * the template renders against.
 *
 * Compliance:
 *   This is a transactional / relationship message under CAN-SPAM (a
 *   reminder for a class the customer paid for). The Google review CTA is
 *   a small footer section, not the headline. Physical address is included
 *   for legitimacy. No unsubscribe link — adding one would confuse
 *   recipients ("will I miss my class?") and is not required for
 *   relationship messages.
 *
 * Deployed to us-east4 via CI/CD pipeline.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineString } from 'firebase-functions/params';
import { Functions, Role, isE2ETestEmail } from '@maple/firebase/functions';
import {
  ClassRepository,
  InstructorRepository,
  RegistrationRepository,
  getDb,
} from '@maple/firebase/database';
import type { Class, ClassSession, Registration } from '@maple/ts/domain';

/**
 * Customer-visible default location. Falls back to this when a class doesn't
 * specify its own `location` field.
 */
const DEFAULT_CLASS_LOCATION = '688 Beulah Rd, Morgantown, WV 26508';

/**
 * Timezone the schedule and "today" window are computed in. Same TZ as
 * `expireAgreementRequests`; matches store hours.
 */
const TIMEZONE = 'America/New_York';

/**
 * Google review shortlink. Configured via Firebase string param so the
 * placeholder can be swapped without redeploying code once Katie pulls the
 * real CID from her Google Business Profile.
 *
 * TODO(reviews): replace the default with the real shortlink. To grab it:
 *   business.google.com → Maple & Spruce profile → "Get more reviews" →
 *   copy the short URL (looks like https://g.page/r/<CID>/review).
 */
const googleReviewUrl = defineString('GOOGLE_REVIEW_URL', {
  description:
    'Google Business Profile review shortlink for the class reminder email CTA',
  default: 'https://g.page/r/REPLACE_WITH_GOOGLE_CID/review',
});

/**
 * Counters returned from `runSendClassReminders` — exposed so the
 * admin-callable trigger and integration tests can assert behavior.
 */
export interface SendClassRemindersResult {
  /** Number of reminder emails queued in the `mail` collection */
  mailQueued: number;
  /** Skipped: registration already had a reminder for today's session */
  skippedAlreadySent: number;
  /** Skipped: registration was not in `confirmed` (paid) status */
  skippedNotPaid: number;
  /** Number of published classes that had a session inside today's window */
  classesWithSessionToday: number;
}

/**
 * Compute the [start, end] of "today" in the configured timezone, expressed
 * as JS `Date` instances (which are UTC under the hood). Used to bracket
 * sessions whose `dateTime` falls inside today in ET.
 */
function getTodayWindow(now: Date): { start: Date; end: Date } {
  // Build YYYY-MM-DD for "now" in ET.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const ymd = formatter.format(now); // "2026-05-06"

  // Compute the UTC offset for ET at this instant. ET is either -5 or -4.
  const tzOffsetMinutes = getTimezoneOffsetMinutes(now, TIMEZONE);

  // Start of day in ET → UTC: subtract the offset.
  // e.g. 2026-05-06 00:00 ET (DST) = 2026-05-06 04:00 UTC. offset = -240.
  const [yStr, mStr, dStr] = ymd.split('-');
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const d = Number(dStr);
  const startUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - tzOffsetMinutes * 60_000;
  const start = new Date(startUtcMs);
  const end = new Date(startUtcMs + 24 * 60 * 60 * 1000 - 1);

  return { start, end };
}

/**
 * Resolve a timezone's offset (in minutes east of UTC) at a given instant.
 * Uses Intl to handle DST automatically.
 */
function getTimezoneOffsetMinutes(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  // Hour can be "24" in en-US for midnight; normalize.
  const hour = map['hour'] === '24' ? '00' : map['hour'];
  const tzMs = Date.UTC(
    Number(map['year']),
    Number(map['month']) - 1,
    Number(map['day']),
    Number(hour),
    Number(map['minute']),
    Number(map['second'])
  );
  // (tz wall-clock as if UTC) - (actual UTC) = offset in ms east of UTC.
  return Math.round((tzMs - at.getTime()) / 60_000);
}

/**
 * Format a Date for display in the configured timezone.
 * Produces e.g. `"Saturday, May 23"`.
 */
function formatClassDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a Date as a human time in the configured timezone.
 * Produces e.g. `"2:00 PM"`.
 */
function formatClassTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Pick the session of a class that falls inside today's window, if any.
 * Returns the earliest matching session — multi-session classes with two
 * sessions on the same day (rare) get one reminder for the earliest.
 */
function findSessionToday(
  classEntity: Class,
  start: Date,
  end: Date
): ClassSession | undefined {
  return [...classEntity.sessions]
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
    .find((s) => s.dateTime >= start && s.dateTime <= end);
}

/**
 * "Paid" for reminder purposes means `confirmed` — the customer paid (or
 * had a $0 free class confirmed) and is expected to attend. `pending` is
 * payment-in-flight and `cancelled`/`refunded`/`no-show` should not get a
 * reminder.
 */
function isPaidRegistration(reg: Registration): boolean {
  return reg.status === 'confirmed';
}

/**
 * Has this registration already been reminded for this specific session?
 * Reads the per-session map written by `markReminderSentForSession`.
 */
function hasReminderForSession(
  reg: Registration,
  sessionIso: string
): boolean {
  const map = reg.reminderSentForSessions;
  return Boolean(map && map[sessionIso]);
}

/**
 * Core business logic. Exported separately so the scheduled function and
 * the admin-callable share a single implementation, and so unit/integration
 * tests can drive it without going through Cloud Scheduler.
 */
export async function runSendClassReminders(
  now: Date = new Date()
): Promise<SendClassRemindersResult> {
  if (getApps().length === 0) {
    initializeApp();
  }

  const { start, end } = getTodayWindow(now);
  const reviewUrl = googleReviewUrl.value();

  // Pull every published class. We can't query "session today" directly
  // because `sessions` is an array — the data set is small (a few dozen
  // active classes), so the in-memory filter is fine.
  const publishedClasses = await ClassRepository.findAll({
    status: 'published',
  });

  const todayClasses = publishedClasses
    .map((c) => ({ class: c, session: findSessionToday(c, start, end) }))
    .filter(
      (entry): entry is { class: Class; session: ClassSession } =>
        entry.session !== undefined
    );

  if (todayClasses.length === 0) {
    console.log(
      `[sendClassReminders] No published classes with sessions on ${start.toISOString()} (ET window). Nothing to do.`
    );
    return {
      mailQueued: 0,
      skippedAlreadySent: 0,
      skippedNotPaid: 0,
      classesWithSessionToday: 0,
    };
  }

  const db = getDb();
  let mailQueued = 0;
  let skippedAlreadySent = 0;
  let skippedNotPaid = 0;

  for (const { class: classEntity, session } of todayClasses) {
    const instructorName = classEntity.instructorId
      ? (await InstructorRepository.findById(classEntity.instructorId))?.name
      : undefined;

    const sessionIso = session.dateTime.toISOString();

    const registrations = await RegistrationRepository.findByClassId(
      classEntity.id
    );

    for (const reg of registrations) {
      if (!isPaidRegistration(reg)) {
        skippedNotPaid += 1;
        continue;
      }
      if (hasReminderForSession(reg, sessionIso)) {
        skippedAlreadySent += 1;
        continue;
      }
      // Skip dev-DB rows created by the registration-e2e suite — the
      // dev project's Send Email extension uses real Gmail SMTP and
      // would NXDOMAIN-bounce against the `.test` TLD recipients.
      if (isE2ETestEmail(reg.customerEmail)) {
        console.log(
          `[sendClassReminders] Skipping E2E test registration ${reg.id} (${reg.customerEmail})`
        );
        continue;
      }

      // Build the data payload. Drop optional fields when missing so the
      // template doesn't render `undefined` placeholders.
      const data: Record<string, string> = {
        customerName: reg.customerName,
        className: classEntity.name,
        classDate: formatClassDate(session.dateTime),
        classStartTime: formatClassTime(session.dateTime),
        classLocation: classEntity.location || DEFAULT_CLASS_LOCATION,
        googleReviewUrl: reviewUrl,
      };
      if (instructorName) {
        data['instructorName'] = instructorName;
      }

      // Queue email via firestore-send-email extension. The template body
      // lives in `email-templates/class-reminder`.
      await db.collection('mail').add({
        to: reg.customerEmail,
        template: {
          name: 'class-reminder',
          data,
        },
      });

      await RegistrationRepository.markReminderSentForSession(
        reg.id,
        sessionIso,
        now
      );

      mailQueued += 1;
    }
  }

  console.log(
    `[sendClassReminders] Queued ${mailQueued} reminder email(s); skipped ${skippedAlreadySent} already-sent, ${skippedNotPaid} not-paid; covered ${todayClasses.length} class(es) with sessions today.`
  );

  return {
    mailQueued,
    skippedAlreadySent,
    skippedNotPaid,
    classesWithSessionToday: todayClasses.length,
  };
}

/**
 * Scheduled trigger — runs daily at 08:00 America/New_York.
 */
export const sendClassReminders = onSchedule(
  {
    schedule: '0 8 * * *', // 8:00 AM every day
    timeZone: TIMEZONE,
    region: 'us-east4',
  },
  async () => {
    await runSendClassReminders(new Date());
  }
);

/**
 * Admin-callable manual trigger — runs the same business logic on demand.
 *
 * Why this exists:
 *   - Manual catch-up if the daily schedule ever misfires (e.g. CloudScheduler
 *     pause/incident). Katie can run it from the admin UI to bring everyone
 *     who should have been reminded today back into compliance.
 *   - Drives integration tests — `onSchedule` triggers aren't reachable via
 *     HTTP in the Firebase emulator, but admin-callable HTTPS triggers are.
 */
export const triggerClassReminders = Functions.endpoint
  .requiringRole(Role.Admin)
  .handle<Record<string, never>, SendClassRemindersResult>(async () => {
    return runSendClassReminders(new Date());
  });
