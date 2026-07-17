/**
 * Send Music Together Reminders
 *
 * Day-of reminder emails for enrolled Music Together families, mirroring
 * `sendClassReminders` (which only covers the regular class program — MT
 * sections are a separate entity and were previously getting no reminder).
 *
 * Two exports share the same logic:
 *   - `sendMusicTogetherReminders` — scheduled, daily 08:00 America/New_York.
 *   - `triggerMusicTogetherReminders` — admin-only HTTPS callable running the
 *     same logic on demand. Useful for manual catch-up, and (importantly) gives
 *     integration tests a way to drive it — the emulator doesn't expose
 *     `onSchedule` triggers over HTTP.
 *
 * Per run:
 *   1. Compute today's window in America/New_York.
 *   2. Find every publicly-visible section with a session inside the window.
 *   3. For each, email every confirmed family once per session — keyed by the
 *      session's ISO `dateTime` in `reminderSentForSessions` so a second run on
 *      the same day is a no-op (run-twice idempotent).
 *
 * Each reminder carries the family's auto-updating calendar subscribe link
 * (webcal://) so recipients can subscribe once and stop asking "when is my
 * class again?".
 *
 * Emails are queued via the firestore-send-email extension (`mail` collection),
 * rendered from the `music-together-reminder` Handlebars template (seeded by
 * `tools/seed-email-templates.ts`).
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  Functions,
  Role,
  isE2ETestEmail,
  familyCalendarSubscribeUrl,
} from '@maple/firebase/functions';
import {
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
} from '@maple/firebase/database';
import type {
  MusicTogetherSection,
  MusicTogetherSession,
  MusicTogetherRegistration,
} from '@maple/ts/domain';

const TIMEZONE = 'America/New_York';

/** Default MT class location; sections may override via `location`. */
const DEFAULT_MT_LOCATION = '688 Beulah Rd, Morgantown, WV 26508';

export interface SendMusicTogetherRemindersResult {
  /** Reminder emails queued in the `mail` collection. */
  mailQueued: number;
  /** Skipped: family already reminded for this session. */
  skippedAlreadySent: number;
  /** Skipped: registration not in `confirmed` status. */
  skippedNotConfirmed: number;
  /** Live sections that had a session inside today's window. */
  sectionsWithSessionToday: number;
}

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
  const hour = map['hour'] === '24' ? '00' : map['hour'];
  const tzMs = Date.UTC(
    Number(map['year']),
    Number(map['month']) - 1,
    Number(map['day']),
    Number(hour),
    Number(map['minute']),
    Number(map['second'])
  );
  return Math.round((tzMs - at.getTime()) / 60_000);
}

function getTodayWindow(now: Date): { start: Date; end: Date } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const tzOffsetMinutes = getTimezoneOffsetMinutes(now, TIMEZONE);
  const [yStr, mStr, dStr] = ymd.split('-');
  const startUtcMs =
    Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr), 0, 0, 0, 0) -
    tzOffsetMinutes * 60_000;
  return {
    start: new Date(startUtcMs),
    end: new Date(startUtcMs + 24 * 60 * 60 * 1000 - 1),
  };
}

function formatSessionDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    timeZone: TIMEZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatSessionTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The earliest session of a section that falls inside today's window. */
function findSessionToday(
  section: MusicTogetherSection,
  start: Date,
  end: Date
): MusicTogetherSession | undefined {
  return [...section.sessions]
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
    .find((s) => s.dateTime >= start && s.dateTime <= end);
}

function hasReminderForSession(
  reg: MusicTogetherRegistration,
  sessionIso: string
): boolean {
  return Boolean(reg.reminderSentForSessions?.[sessionIso]);
}

type ReminderOutcome = 'queued' | 'alreadySent' | 'notConfirmed' | 'skippedTest';

/**
 * Decide + send the reminder for one family/session. Extracted so the run loop
 * stays flat (and testable) — returns what happened so the caller can tally.
 */
async function sendReminderForRegistration(
  db: FirebaseFirestore.Firestore,
  section: MusicTogetherSection,
  session: MusicTogetherSession,
  reg: MusicTogetherRegistration,
  now: Date
): Promise<ReminderOutcome> {
  const sessionIso = session.dateTime.toISOString();
  if (reg.status !== 'confirmed') return 'notConfirmed';
  if (hasReminderForSession(reg, sessionIso)) return 'alreadySent';
  if (isE2ETestEmail(reg.email)) {
    console.log(
      `[sendMusicTogetherReminders] Skipping E2E test registration ${reg.id} (${reg.email})`
    );
    return 'skippedTest';
  }

  const data: Record<string, string> = {
    parentName: reg.parentNames[0] ?? '',
    sectionName: section.name,
    classDate: formatSessionDate(session.dateTime),
    classStartTime: formatSessionTime(session.dateTime),
    classLocation: section.location || DEFAULT_MT_LOCATION,
  };
  if (reg.calendarToken) {
    data['calendarSubscribeUrl'] = familyCalendarSubscribeUrl(reg.calendarToken);
  }

  await db.collection('mail').add({
    to: reg.email,
    template: { name: 'music-together-reminder', data },
  });
  await MusicTogetherRegistrationRepository.markReminderSentForSession(
    reg.id,
    sessionIso,
    now
  );
  return 'queued';
}

/**
 * Core business logic — shared by the scheduled function and the admin
 * callable so tests can drive it without Cloud Scheduler.
 */
export async function runSendMusicTogetherReminders(
  now: Date = new Date()
): Promise<SendMusicTogetherRemindersResult> {
  if (admin.apps.length === 0) {
    admin.initializeApp();
  }

  const { start, end } = getTodayWindow(now);

  // Small data set (a handful of live sections) — pull all and filter in
  // memory, since `sessions` is an array we can't range-query directly. Only
  // publicly-visible sections get reminders; hidden drafts are skipped. A
  // session inside today's window already means the term is running, so we
  // don't gate on the (derived) enrollment status.
  const sections = await MusicTogetherSectionRepository.findAll();
  const todaySections = sections
    .filter((s) => s.visible)
    .map((section) => ({ section, session: findSessionToday(section, start, end) }))
    .filter(
      (
        entry
      ): entry is { section: MusicTogetherSection; session: MusicTogetherSession } =>
        entry.session !== undefined
    );

  const result: SendMusicTogetherRemindersResult = {
    mailQueued: 0,
    skippedAlreadySent: 0,
    skippedNotConfirmed: 0,
    sectionsWithSessionToday: todaySections.length,
  };

  if (todaySections.length === 0) {
    console.log(
      `[sendMusicTogetherReminders] No live sections with a session on ${start.toISOString()} (ET window). Nothing to do.`
    );
    return result;
  }

  const db = admin.firestore();

  for (const { section, session } of todaySections) {
    const registrations =
      await MusicTogetherRegistrationRepository.findBySectionId(section.id);

    for (const reg of registrations) {
      const outcome = await sendReminderForRegistration(
        db,
        section,
        session,
        reg,
        now
      );
      if (outcome === 'queued') result.mailQueued += 1;
      else if (outcome === 'alreadySent') result.skippedAlreadySent += 1;
      else if (outcome === 'notConfirmed') result.skippedNotConfirmed += 1;
    }
  }

  console.log(
    `[sendMusicTogetherReminders] Queued ${result.mailQueued} reminder(s); skipped ${result.skippedAlreadySent} already-sent, ${result.skippedNotConfirmed} not-confirmed; covered ${todaySections.length} section(s).`
  );

  return result;
}

/** Scheduled trigger — daily at 08:00 America/New_York. */
export const sendMusicTogetherReminders = onSchedule(
  {
    schedule: '0 8 * * *',
    timeZone: TIMEZONE,
    region: 'us-east4',
  },
  async () => {
    await runSendMusicTogetherReminders(new Date());
  }
);

/** Admin-callable manual trigger — same logic on demand (and drives tests). */
export const triggerMusicTogetherReminders = Functions.endpoint
  .requiringRole([Role.Admin, Role.MtTeacher])
  .handle<Record<string, never>, SendMusicTogetherRemindersResult>(async () => {
    return runSendMusicTogetherReminders(new Date());
  });
