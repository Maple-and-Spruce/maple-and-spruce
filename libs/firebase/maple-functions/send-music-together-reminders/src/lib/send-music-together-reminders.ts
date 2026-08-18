/**
 * Send Music Together Reminders
 *
 * The daily Music Together reminder run. Two exports share one implementation:
 *   - `sendMusicTogetherReminders` — scheduled, daily 08:00 America/New_York.
 *   - `triggerMusicTogetherReminders` — admin-only HTTPS callable running the
 *     same logic on demand. Useful for manual catch-up, and (importantly) gives
 *     integration tests a way to drive it — the emulator doesn't expose
 *     `onSchedule` triggers over HTTP.
 *
 * FIVE PASSES, all idempotent, per run (#778):
 *
 *   Enrolled families (sections)
 *     A. Day-of reminder for every section meeting TODAY. Weekly nudge for a
 *        class the family already attends. Keyed per session ISO in
 *        `reminderSentForSessions`.
 *     B. One week before the section's FIRST session.
 *     C. Two days before the section's FIRST session.
 *
 *   Demo families (free try-a-class RSVPs)
 *     D. One week before the demo.
 *     E. Two days before the demo — this one also carries the founding-family
 *        enrollment nudge (take-home instrument kit), per Stephanie's sequence.
 *
 * Passes B–E are the "getting ready for your first visit" sequence: arrive ten
 * minutes early, dress for the floor, come as you are. They fire ONCE per
 * family per class, unlike pass A which recurs weekly.
 *
 * WHY DEMOS AND SECTIONS DIFFER: pass A is same-day because an enrolled family
 * attends the same section every week and needs a nudge, not a plan. Demos are
 * one-off, often booked weeks ahead, and frequently OFFSITE (a public library,
 * not Maple & Spruce) — so they get lead time instead, and their location is
 * always read from the demo record rather than assumed to be Beulah Road.
 *
 * Idempotency: section passes stamp `reminderSentForSessions` (pass A under the
 * raw session ISO, passes B/C under `pre7:`/`pre48:` prefixed keys so they can't
 * collide with the day-of stamp for the same session). Demo passes stamp
 * `reminder7dSentAt` / `reminder48hSentAt` on the RSVP. A second run on the same
 * day is a no-op throughout.
 *
 * Section reminders carry the family's auto-updating calendar subscribe link
 * (webcal://) so recipients can subscribe once and stop asking "when is my
 * class again?".
 *
 * Emails are queued through `queueMail` (which brands them as Music Together
 * and is the swap point for #775), rendered from Handlebars templates seeded by
 * `tools/seed-email-templates.ts`.
 *
 * Deployed to us-east4 via CI/CD (maple-core codebase).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  Functions,
  Role,
  queueMail,
  familyCalendarSubscribeUrl,
} from '@maple/firebase/functions';
import {
  MusicTogetherSectionRepository,
  MusicTogetherRegistrationRepository,
  MusicTogetherDemoRepository,
  MusicTogetherDemoRsvpRepository,
} from '@maple/firebase/database';
import {
  MT_DEMO_TITLE,
  MT_DEFAULT_LOCATION,
  formatNameList,
  type MusicTogetherSection,
  type MusicTogetherSession,
  type MusicTogetherRegistration,
  type MusicTogetherDemo,
  type MusicTogetherDemoRsvp,
} from '@maple/ts/domain';

const TIMEZONE = 'America/New_York';

/** Lead times for the pre-first-class sequence, in whole ET days. */
const LEAD_DAYS = { '7d': 7, '48h': 2 } as const;
type Lead = keyof typeof LEAD_DAYS;

export interface SendMusicTogetherRemindersResult {
  /** Reminder emails queued in the `mail` collection (all five passes). */
  mailQueued: number;
  /** Skipped: family already reminded for this session/lead time. */
  skippedAlreadySent: number;
  /** Skipped: registration not in `confirmed` status. */
  skippedNotConfirmed: number;
  /** Live sections that had a session inside today's window. */
  sectionsWithSessionToday: number;
  /** Sections whose first session falls on a lead-time day. */
  sectionsWithUpcomingFirstClass: number;
  /** Visible demos falling on a lead-time day. */
  demosUpcoming: number;
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

/**
 * The America/New_York calendar day `offsetDays` from `now`, as a UTC instant
 * range. Offset 0 is today, 7 is a week out.
 *
 * The offset is applied to the ET CALENDAR DATE (via `Date.UTC` arithmetic on
 * the y/m/d parts), not by adding 24h × n milliseconds — so a DST transition
 * inside the range can't slide the window onto the wrong day.
 */
function getDayWindow(now: Date, offsetDays = 0): { start: Date; end: Date } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [yStr, mStr, dStr] = ymd.split('-');

  // Shift the calendar date first, then resolve that date's ET offset — the
  // target day may sit on the other side of a DST boundary from `now`.
  const targetUtcMidnight = new Date(
    Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr) + offsetDays, 12, 0, 0)
  );
  const targetYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(targetUtcMidnight);
  const [tyStr, tmStr, tdStr] = targetYmd.split('-');
  const tzOffsetMinutes = getTimezoneOffsetMinutes(targetUtcMidnight, TIMEZONE);

  const startUtcMs =
    Date.UTC(Number(tyStr), Number(tmStr) - 1, Number(tdStr), 0, 0, 0, 0) -
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

function formatSessionDay(d: Date): string {
  return d.toLocaleDateString('en-US', { timeZone: TIMEZONE, weekday: 'long' });
}

function formatSessionTime(d: Date): string {
  return d.toLocaleTimeString('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** The earliest session of a section that falls inside a window. */
function findSessionInWindow(
  section: MusicTogetherSection,
  start: Date,
  end: Date
): MusicTogetherSession | undefined {
  return [...section.sessions]
    .sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime())
    .find((s) => s.dateTime >= start && s.dateTime <= end);
}

/** A section's first meeting of the term. */
function firstSession(
  section: MusicTogetherSection
): MusicTogetherSession | undefined {
  return [...section.sessions].sort(
    (a, b) => a.dateTime.getTime() - b.dateTime.getTime()
  )[0];
}

function hasReminderForKey(
  reg: MusicTogetherRegistration,
  key: string
): boolean {
  return Boolean(reg.reminderSentForSessions?.[key]);
}

type ReminderOutcome = 'queued' | 'alreadySent' | 'notConfirmed' | 'skippedTest';

/** Shared template fields for anything addressed to an enrolled family. */
function sectionTemplateData(
  section: MusicTogetherSection,
  session: MusicTogetherSession,
  reg: MusicTogetherRegistration
): Record<string, string> {
  const data: Record<string, string> = {
    caregiverName: formatNameList(reg.parentNames),
    childNames: formatNameList(reg.children.map((c) => c.name)),
    sectionName: section.name,
    classDate: formatSessionDate(session.dateTime),
    classDay: formatSessionDay(session.dateTime),
    classStartTime: formatSessionTime(session.dateTime),
    classLocation: section.location || MT_DEFAULT_LOCATION,
  };
  if (reg.calendarToken) {
    data['calendarSubscribeUrl'] = familyCalendarSubscribeUrl(reg.calendarToken);
  }
  return data;
}

/**
 * Decide + send one reminder for one family. Extracted so the run loop stays
 * flat (and testable) — returns what happened so the caller can tally.
 *
 * `stampKey` is what makes the send idempotent: pass A uses the raw session
 * ISO, passes B/C use a `pre7:`/`pre48:` prefix so a first-class email and the
 * day-of email for that same session are tracked independently.
 */
async function sendReminderForRegistration(
  section: MusicTogetherSection,
  reg: MusicTogetherRegistration,
  session: MusicTogetherSession,
  templateName: string,
  stampKey: string,
  now: Date
): Promise<ReminderOutcome> {
  if (reg.status !== 'confirmed') return 'notConfirmed';
  if (hasReminderForKey(reg, stampKey)) return 'alreadySent';

  const queued = await queueMail({
    to: reg.email,
    templateName,
    data: sectionTemplateData(section, session, reg),
    sender: 'music-together',
  });
  if (!queued) return 'skippedTest';

  await MusicTogetherRegistrationRepository.markReminderSentForSession(
    reg.id,
    stampKey,
    now
  );
  return 'queued';
}

/** Shared template fields for a demo RSVP. */
function demoTemplateData(
  demo: MusicTogetherDemo,
  rsvp: MusicTogetherDemoRsvp
): Record<string, string> {
  return {
    caregiverName: rsvp.name,
    demoTitle: MT_DEMO_TITLE,
    demoDate: formatSessionDate(demo.dateTime),
    demoDay: formatSessionDay(demo.dateTime),
    demoTime: formatSessionTime(demo.dateTime),
    // Always the demo's own location — demos are regularly held offsite, so
    // this must never fall back to the Beulah Road studio address.
    demoLocation: demo.location,
  };
}

async function sendDemoReminder(
  demo: MusicTogetherDemo,
  rsvp: MusicTogetherDemoRsvp,
  lead: Lead,
  now: Date
): Promise<ReminderOutcome> {
  // Waitlisted families have no seat yet — reminding them to show up would be
  // worse than saying nothing.
  if (rsvp.status !== 'confirmed') return 'notConfirmed';
  const alreadySent =
    lead === '7d' ? rsvp.reminder7dSentAt : rsvp.reminder48hSentAt;
  if (alreadySent) return 'alreadySent';

  const queued = await queueMail({
    to: rsvp.email,
    templateName:
      lead === '7d'
        ? 'music-together-demo-reminder-7d'
        : 'music-together-demo-reminder-48h',
    data: demoTemplateData(demo, rsvp),
    sender: 'music-together',
  });
  if (!queued) return 'skippedTest';

  await MusicTogetherDemoRsvpRepository.markReminderSent(
    demo.id,
    rsvp.email,
    lead,
    now
  );
  return 'queued';
}

/** Records what each send did, so the passes stay free of counter plumbing. */
type Tally = (outcome: ReminderOutcome) => void;

/** Pass A — every publicly-visible section meeting today, weekly nudge. */
async function runSectionDayOfPass(
  sections: MusicTogetherSection[],
  now: Date,
  tally: Tally
): Promise<number> {
  const { start, end } = getDayWindow(now, 0);
  let covered = 0;

  for (const section of sections) {
    const session = findSessionInWindow(section, start, end);
    if (!session) continue;
    covered += 1;

    const registrations =
      await MusicTogetherRegistrationRepository.findBySectionId(section.id);
    for (const reg of registrations) {
      tally(
        await sendReminderForRegistration(
          section,
          reg,
          session,
          'music-together-reminder',
          session.dateTime.toISOString(),
          now
        )
      );
    }
  }
  return covered;
}

/**
 * Passes B & C — a section whose FIRST session lands on the lead-time day.
 * Keyed off the first session only: a mid-term week that happens to fall seven
 * days out is not a first class and must not trigger the welcome sequence.
 */
async function runFirstClassPass(
  sections: MusicTogetherSection[],
  lead: Lead,
  now: Date,
  tally: Tally
): Promise<number> {
  const { start, end } = getDayWindow(now, LEAD_DAYS[lead]);
  let covered = 0;

  for (const section of sections) {
    const first = firstSession(section);
    if (!first || first.dateTime < start || first.dateTime > end) continue;
    covered += 1;

    const registrations =
      await MusicTogetherRegistrationRepository.findBySectionId(section.id);
    for (const reg of registrations) {
      tally(
        await sendReminderForRegistration(
          section,
          reg,
          first,
          lead === '7d'
            ? 'music-together-first-class-7d'
            : 'music-together-first-class-48h',
          `pre${lead === '7d' ? '7' : '48'}:${first.dateTime.toISOString()}`,
          now
        )
      );
    }
  }
  return covered;
}

/** Passes D & E — visible demos landing on the lead-time day. */
async function runDemoPass(
  lead: Lead,
  now: Date,
  tally: Tally
): Promise<number> {
  const { start, end } = getDayWindow(now, LEAD_DAYS[lead]);
  // `findUpcomingVisible` is an indexed visible+dateTime query; narrow the tail
  // in memory so this doesn't need another composite index.
  const demos = (
    await MusicTogetherDemoRepository.findUpcomingVisible(start)
  ).filter((d) => d.dateTime <= end);

  for (const demo of demos) {
    const rsvps = await MusicTogetherDemoRsvpRepository.findByDemoId(demo.id);
    for (const rsvp of rsvps) {
      tally(await sendDemoReminder(demo, rsvp, lead, now));
    }
  }
  return demos.length;
}

/**
 * Core business logic — shared by the scheduled function and the admin
 * callable so tests can drive it without Cloud Scheduler.
 */
export async function runSendMusicTogetherReminders(
  now: Date = new Date()
): Promise<SendMusicTogetherRemindersResult> {
  if (getApps().length === 0) {
    initializeApp();
  }

  const result: SendMusicTogetherRemindersResult = {
    mailQueued: 0,
    skippedAlreadySent: 0,
    skippedNotConfirmed: 0,
    sectionsWithSessionToday: 0,
    sectionsWithUpcomingFirstClass: 0,
    demosUpcoming: 0,
  };

  const tally: Tally = (outcome) => {
    if (outcome === 'queued') result.mailQueued += 1;
    else if (outcome === 'alreadySent') result.skippedAlreadySent += 1;
    else if (outcome === 'notConfirmed') result.skippedNotConfirmed += 1;
  };

  // Small data set (a handful of live sections) — pull all and filter in
  // memory, since `sessions` is an array we can't range-query directly. Only
  // publicly-visible sections get reminders; hidden drafts are skipped.
  const sections = (await MusicTogetherSectionRepository.findAll()).filter(
    (s) => s.visible
  );

  result.sectionsWithSessionToday = await runSectionDayOfPass(
    sections,
    now,
    tally
  );

  for (const lead of Object.keys(LEAD_DAYS) as Lead[]) {
    result.sectionsWithUpcomingFirstClass += await runFirstClassPass(
      sections,
      lead,
      now,
      tally
    );
    result.demosUpcoming += await runDemoPass(lead, now, tally);
  }

  console.log(
    `[sendMusicTogetherReminders] Queued ${result.mailQueued} email(s); ` +
      `skipped ${result.skippedAlreadySent} already-sent, ${result.skippedNotConfirmed} not-confirmed. ` +
      `Covered ${result.sectionsWithSessionToday} section(s) meeting today, ` +
      `${result.sectionsWithUpcomingFirstClass} first-class window(s), ` +
      `${result.demosUpcoming} upcoming demo(s).`
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
