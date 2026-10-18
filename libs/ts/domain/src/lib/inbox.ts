/**
 * The Home dashboard's Inbox (#235).
 *
 * One row per thing someone has to do, studio-wide, for Katie and Nathan to
 * work between lessons. The rule that shapes everything here: **an item
 * disappears on its own once it is resolved**, and nothing old or useless gets
 * in. An inbox that fills with things nobody can act on stops being read, so
 * each kind carries its own freshness rule:
 *
 *  - a lesson inquiry is listed while it is `new` and no older than
 *    `INBOX_INQUIRY_MAX_AGE_DAYS`; older `new` ones fold into one summary row
 *  - a failed lesson charge is listed until it is retried, waived or cancelled
 *  - Craft Club: a `past_due` member and a `requested` one
 *  - an unsigned agreement only for a class meeting within
 *    `INBOX_AGREEMENT_WINDOW_DAYS`, one row per class
 *  - needs-attention rows, with taught-but-unbilled and blockless lessons
 *    limited to the last `INBOX_LESSON_LOOKBACK_DAYS`
 *  - pending inventory sync conflicts, as one row
 *  - a contract instructor not cleared to teach, only while their next class
 *    meets within `INBOX_INSTRUCTOR_READINESS_WINDOW_DAYS`
 *  - a published class below its minimum enrollment, only while its first
 *    session is within `INBOX_UNDER_MINIMUM_WINDOW_DAYS`; it leaves once
 *    enough seats are confirmed or the class stops being published
 *
 * "Mark done" hides an item for everyone. It is keyed on the item's `key`,
 * which starts with the kind and names the record **and** the state that made
 * it actionable, so a new
 * failure on the same charge is a new key and comes back (`dismissedKeys`).
 *
 * Everything here is pure and takes `now`, so the rules are tested without
 * Firestore and the server and the spec agree on one definition each.
 */
import type { AgreementRequest } from './agreement-request';
import type { CraftClubMember } from './craft-club-member';
import { isLessonInquiryStale } from './lesson-inquiry';
import type { LessonInquiry } from './lesson-inquiry';
import type { LessonScheduledCharge } from './lesson-scheduled-charge';
import { DEFAULT_LESSON_TIME_ZONE } from './lesson-block';
import type { NeedsAttentionGroup, NeedsAttentionKind } from './needs-attention';
import { zonedDateKey } from './schedule-format';
import {
  describeMissingReadiness,
  instructorEditHref,
  type InstructorNotReadyToTeach,
} from './instructor';

export type InboxItemKind =
  | 'lesson-inquiry'
  | 'lesson-inquiries-older'
  | 'charge-failed'
  | 'craft-club-past-due'
  | 'craft-club-requested'
  | 'agreement-unsigned'
  | 'sync-conflicts'
  | 'instructor-not-ready'
  | 'class-under-minimum'
  | NeedsAttentionKind;

/**
 * The eyebrow over each row, and the kind in a row's accessible name. Kept to a
 * word or two: the eyebrow shares one line with the age, and at the two-column
 * width a longer label was cut to "INVOICE OVERD…". The title and detail carry
 * the rest.
 */
export const INBOX_KIND_LABELS: Record<InboxItemKind, string> = {
  'lesson-inquiry': 'Inquiry',
  'lesson-inquiries-older': 'Inquiries',
  'charge-failed': 'Charge failed',
  'craft-club-past-due': 'Craft Club',
  'craft-club-requested': 'Craft Club',
  'agreement-unsigned': 'Unsigned',
  'sync-conflicts': 'Sync',
  'instructor-not-ready': 'Not cleared',
  'class-under-minimum': 'Under minimum',
  'lesson-unbilled': 'Not billed',
  'invoice-overdue': 'Overdue',
  'invoice-sync-failed': 'Not sent',
  'hope-unsubmitted': 'Hope claim',
  'lesson-unattributed': 'No block',
};

export interface InboxItem {
  /**
   * The record plus the state that made it actionable, e.g.
   * `charge-failed:<chargeId>:<failedAtMs>`. Dismissals are stored by this.
   */
  key: string;
  kind: InboxItemKind;
  title: string;
  detail?: string;
  /** The page where the item is resolved. */
  href: string;
  /** The verb on the row's button: "Reply", "Retry charge", … */
  actionLabel: string;
  /** ISO: when it became something to do. Drives the row's age. */
  occurredAt: string;
  /** ISO: when it must be done by, for a deadline (an agreement's class). */
  dueAt?: string;
  /** Stale, failed or due soon: drawn in clay and sorted first. */
  urgent: boolean;
}

/** A `new` inquiry older than this is summarised, not listed one by one. */
export const INBOX_INQUIRY_MAX_AGE_DAYS = 30;
/** Unsigned agreements surface for classes meeting within this many days. */
export const INBOX_AGREEMENT_WINDOW_DAYS = 7;
/** …and are urgent when the class is within this many hours. */
export const INBOX_AGREEMENT_URGENT_HOURS = 48;
/**
 * An uncleared contract instructor surfaces once their next class is this
 * close. Wider than the agreement window: a background check or payroll
 * onboarding takes days, so a week's notice is already late.
 */
export const INBOX_INSTRUCTOR_READINESS_WINDOW_DAYS = 14;
/** …and is urgent inside this many days. */
export const INBOX_INSTRUCTOR_READINESS_URGENT_DAYS = 7;
/**
 * A published class under its minimum enrollment surfaces once its first
 * session is this close: the same week's notice as the email to staff.
 */
export const INBOX_UNDER_MINIMUM_WINDOW_DAYS = 7;
/** …and is urgent inside this many days. */
export const INBOX_UNDER_MINIMUM_URGENT_DAYS = 3;
/** Unbilled and blockless lessons older than this are not chased here. */
export const INBOX_LESSON_LOOKBACK_DAYS = 14;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface InboxClass {
  id: string;
  name: string;
  sessions: ReadonlyArray<{ dateTime: Date }>;
}

/** A class the under-minimum check reads. */
export interface InboxMinimumClass extends InboxClass {
  status: string;
  minimumEnrollment?: number | null;
}

export interface InboxSources {
  now: Date;
  /** Any inquiries; only `new` ones are used. */
  inquiries: ReadonlyArray<
    Pick<
      LessonInquiry,
      | 'id'
      | 'status'
      | 'submittedAt'
      | 'contactName'
      | 'interest'
      | 'studentAge'
      | 'formName'
    >
  >;
  /** Any lesson charges; only `failed` ones are used. */
  charges: ReadonlyArray<
    Pick<
      LessonScheduledCharge,
      | 'id'
      | 'status'
      | 'studentId'
      | 'amountCents'
      | 'lastError'
      | 'resolvedAt'
      | 'updatedAt'
    >
  >;
  studentNames: ReadonlyMap<string, string>;
  /** Each student's next non-cancelled lesson, if any. */
  nextLessonAt: ReadonlyMap<string, Date>;
  craftClubMembers: ReadonlyArray<
    Pick<
      CraftClubMember,
      'id' | 'status' | 'name' | 'email' | 'createdAt' | 'updatedAt'
    >
  >;
  /** Any agreement requests; only `pending` ones with a class are used. */
  agreementRequests: ReadonlyArray<
    Pick<AgreementRequest, 'id' | 'status' | 'classId' | 'createdAt'>
  >;
  /** The classes those requests name. */
  classes: ReadonlyArray<InboxClass>;
  needsAttention: ReadonlyArray<NeedsAttentionGroup>;
  /** Pending sync conflicts. */
  syncConflicts: ReadonlyArray<{ detectedAt: Date }>;
  /** Contract instructors not cleared to teach who have a class coming up. */
  instructorsNotReady: ReadonlyArray<InstructorNotReadyToTeach>;
  /**
   * Classes that may be under their minimum (see `classesForMinimumCheck`),
   * with the confirmed seats each has, summed by quantity.
   */
  minimumClasses: ReadonlyArray<InboxMinimumClass>;
  confirmedSeats: ReadonlyMap<string, number>;
  /** Shop timezone for day words and clock times. */
  timeZone?: string;
}

function ms(d: Date): number {
  return d.getTime();
}

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function clock(d: Date, timeZone: string): string {
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  });
}

function shortDate(d: Date, timeZone: string): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  });
}

/** Calendar days from `now` to `when`, in the shop timezone. */
function dayOffset(when: Date, now: Date, timeZone: string): number {
  const a = Date.parse(zonedDateKey(now, timeZone));
  const b = Date.parse(zonedDateKey(when, timeZone));
  return Math.round((b - a) / DAY_MS);
}

/** "tonight's", "today's", "tomorrow's", else "Saturday's". */
function possessiveDay(when: Date, now: Date, timeZone: string): string {
  const offset = dayOffset(when, now, timeZone);
  if (offset === 0) {
    const hour = Number(
      when.toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone })
    );
    return hour >= 17 ? 'tonight’s' : 'today’s';
  }
  if (offset === 1) return 'tomorrow’s';
  return `${when.toLocaleDateString('en-US', { weekday: 'long', timeZone })}’s`;
}

/** The first line of an error, clipped: details are on the student page. */
function shortError(error: string | undefined): string {
  const line = (error ?? '').split('\n')[0].trim();
  if (!line) return 'Charge failed';
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

function inquiryItems(sources: InboxSources, tz: string): InboxItem[] {
  const { now } = sources;
  const cutoff = ms(now) - INBOX_INQUIRY_MAX_AGE_DAYS * DAY_MS;
  const open = sources.inquiries.filter((i) => i.status === 'new');
  const recent = open.filter((i) => ms(i.submittedAt) >= cutoff);
  const older = open.filter((i) => ms(i.submittedAt) < cutoff);

  const items: InboxItem[] = recent.map((inquiry) => ({
    key: `lesson-inquiry:${inquiry.id}`,
    kind: 'lesson-inquiry',
    title: inquiry.contactName || 'Unnamed inquiry',
    detail:
      [
        inquiry.interest,
        inquiry.studentAge !== undefined ? `age ${inquiry.studentAge}` : undefined,
        inquiry.formName,
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    href: '/leads',
    actionLabel: 'Reply',
    occurredAt: inquiry.submittedAt.toISOString(),
    urgent: isLessonInquiryStale(inquiry, now),
  }));

  if (older.length > 0) {
    const sorted = [...older].sort((a, b) => ms(a.submittedAt) - ms(b.submittedAt));
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    items.push({
      // A further inquiry crossing the 30-day line changes both parts.
      key: `lesson-inquiries-older:${older.length}:${newest.id}`,
      kind: 'lesson-inquiries-older',
      title: `${older.length} older ${older.length === 1 ? 'inquiry' : 'inquiries'} never contacted`,
      detail: `Oldest from ${shortDate(oldest.submittedAt, tz)}`,
      href: '/leads',
      actionLabel: 'Review',
      occurredAt: newest.submittedAt.toISOString(),
      urgent: false,
    });
  }
  return items;
}

function chargeItems(sources: InboxSources, tz: string): InboxItem[] {
  return sources.charges
    .filter((c) => c.status === 'failed')
    .map((charge) => {
      const failedAt = charge.resolvedAt ?? charge.updatedAt;
      const name = sources.studentNames.get(charge.studentId) ?? 'Unknown student';
      const next = sources.nextLessonAt.get(charge.studentId);
      let nextText: string | undefined;
      if (next && dayOffset(next, sources.now, tz) === 0) {
        nextText = `lesson today at ${clock(next, tz)}`;
      } else if (next) {
        nextText = `next lesson ${shortDate(next, tz)}`;
      }
      return {
        key: `charge-failed:${charge.id}:${ms(failedAt)}`,
        kind: 'charge-failed' as const,
        title: `${name} · ${formatCents(charge.amountCents)}`,
        detail: [shortError(charge.lastError), nextText].filter(Boolean).join(' · '),
        // The student page is where a failed charge is retried.
        href: `/students/${charge.studentId}`,
        actionLabel: 'Retry charge',
        occurredAt: failedAt.toISOString(),
        urgent: true,
      };
    });
}

function craftClubItems(sources: InboxSources): InboxItem[] {
  const items: InboxItem[] = [];
  for (const member of sources.craftClubMembers) {
    const who = member.name?.trim() || member.email;
    if (member.status === 'past_due') {
      items.push({
        // Square flipping a member to past_due stamps updatedAt, so a later
        // failure after a recovery is a new key.
        key: `craft-club-past-due:${member.id}:${ms(member.updatedAt)}`,
        kind: 'craft-club-past-due',
        title: who,
        detail: 'Craft Club payment failed',
        href: '/craft-club',
        actionLabel: 'Review',
        occurredAt: member.updatedAt.toISOString(),
        urgent: false,
      });
    } else if (member.status === 'requested') {
      items.push({
        key: `craft-club-requested:${member.id}`,
        kind: 'craft-club-requested',
        title: who,
        detail: 'Wants to join Craft Club',
        href: '/craft-club',
        actionLabel: 'Review',
        occurredAt: member.createdAt.toISOString(),
        urgent: false,
      });
    }
  }
  return items;
}

/** A class's next session at or after `now`, if it has one. */
export function nextSessionAt(
  cls: Pick<InboxClass, 'sessions'>,
  now: Date
): Date | undefined {
  let best: Date | undefined;
  for (const s of cls.sessions) {
    const at = new Date(s.dateTime);
    if (ms(at) < ms(now)) continue;
    if (!best || ms(at) < ms(best)) best = at;
  }
  return best;
}

function agreementItems(sources: InboxSources, tz: string): InboxItem[] {
  const { now } = sources;
  const classById = new Map(sources.classes.map((c) => [c.id, c]));
  const byClass = new Map<string, Array<Pick<AgreementRequest, 'createdAt'>>>();
  for (const request of sources.agreementRequests) {
    if (request.status !== 'pending' || !request.classId) continue;
    const list = byClass.get(request.classId) ?? [];
    list.push(request);
    byClass.set(request.classId, list);
  }

  const items: InboxItem[] = [];
  for (const [classId, requests] of byClass) {
    const cls = classById.get(classId);
    if (!cls) continue;
    const session = nextSessionAt(cls, now);
    if (!session) continue;
    const until = ms(session) - ms(now);
    if (until > INBOX_AGREEMENT_WINDOW_DAYS * DAY_MS) continue;
    const latest = Math.max(...requests.map((r) => ms(r.createdAt)));
    items.push({
      // A newly pending request changes the key; a signature does not.
      key: `agreement-unsigned:${classId}:${ms(session)}:${latest}`,
      kind: 'agreement-unsigned',
      title: `${requests.length} for ${possessiveDay(session, now, tz)} ${cls.name}`,
      detail: `${shortDate(session, tz)} · ${clock(session, tz)}`,
      href: '/agreements',
      actionLabel: 'Send reminder',
      occurredAt: new Date(latest).toISOString(),
      dueAt: session.toISOString(),
      urgent: until <= INBOX_AGREEMENT_URGENT_HOURS * HOUR_MS,
    });
  }
  return items;
}

const NEEDS_ATTENTION_ACTIONS: Record<NeedsAttentionKind, string> = {
  'lesson-unbilled': 'Bill',
  'invoice-overdue': 'Review',
  'invoice-sync-failed': 'Review',
  'hope-unsubmitted': 'Submit',
  'lesson-unattributed': 'Review',
};

/** Kinds that are about a lesson's date, and only chased while it is recent. */
const LESSON_DATED: ReadonlySet<NeedsAttentionKind> = new Set([
  'lesson-unbilled',
  'lesson-unattributed',
]);

function needsAttentionItems(sources: InboxSources): InboxItem[] {
  const lookback = ms(sources.now) - INBOX_LESSON_LOOKBACK_DAYS * DAY_MS;
  const items: InboxItem[] = [];
  for (const group of sources.needsAttention) {
    for (const row of group.rows) {
      const occurred = row.occurredAt ? new Date(row.occurredAt) : undefined;
      if (LESSON_DATED.has(row.kind) && (!occurred || ms(occurred) < lookback)) {
        continue;
      }
      const at = occurred ?? sources.now;
      const stamp = occurred ? `:${ms(occurred)}` : '';
      items.push({
        key: `${row.kind}:${row.id}${stamp}`,
        kind: row.kind,
        title: row.label,
        detail: row.detail,
        href: row.href ?? '/',
        actionLabel: NEEDS_ATTENTION_ACTIONS[row.kind],
        occurredAt: at.toISOString(),
        // An invoice that never reached Square means nobody was asked to pay.
        urgent: row.kind === 'invoice-sync-failed',
      });
    }
  }
  return items;
}

function instructorReadinessItems(sources: InboxSources, tz: string): InboxItem[] {
  const { now } = sources;
  const items: InboxItem[] = [];
  for (const entry of sources.instructorsNotReady) {
    const until = ms(entry.nextSessionAt) - ms(now);
    if (until <= 0 || until > INBOX_INSTRUCTOR_READINESS_WINDOW_DAYS * DAY_MS) {
      continue;
    }
    items.push({
      // Keyed on the session it is about: "Mark done" holds until the
      // instructor's next class is a different one.
      key: `instructor-not-ready:${entry.instructor.id}:${ms(entry.nextSessionAt)}`,
      kind: 'instructor-not-ready',
      title: `${entry.instructor.name} for ${possessiveDay(entry.nextSessionAt, now, tz)} ${entry.nextClass.name}`,
      detail: `Missing ${describeMissingReadiness(entry.missing)}`,
      href: instructorEditHref(entry.instructor.id),
      actionLabel: 'Update',
      // It became something to do when the class came inside the window.
      occurredAt: new Date(
        ms(entry.nextSessionAt) - INBOX_INSTRUCTOR_READINESS_WINDOW_DAYS * DAY_MS
      ).toISOString(),
      dueAt: entry.nextSessionAt.toISOString(),
      urgent: until <= INBOX_INSTRUCTOR_READINESS_URGENT_DAYS * DAY_MS,
    });
  }
  return items;
}

/** A class's earliest session, whether or not it has passed. */
function firstSessionAt(cls: Pick<InboxClass, 'sessions'>): Date | undefined {
  let first: Date | undefined;
  for (const s of cls.sessions) {
    const at = new Date(s.dateTime);
    if (!first || ms(at) < ms(first)) first = at;
  }
  return first;
}

/**
 * The classes worth counting seats for: published, with a minimum, and whose
 * FIRST session is still ahead and within the window. A class that has
 * already started is running, minimum or not.
 */
export function classesForMinimumCheck<T extends InboxMinimumClass>(
  classes: ReadonlyArray<T>,
  now: Date
): T[] {
  return classes.filter((cls) => {
    if (cls.status !== 'published') return false;
    if (typeof cls.minimumEnrollment !== 'number' || cls.minimumEnrollment < 1) {
      return false;
    }
    const first = firstSessionAt(cls);
    if (!first) return false;
    const until = ms(first) - ms(now);
    return until > 0 && until <= INBOX_UNDER_MINIMUM_WINDOW_DAYS * DAY_MS;
  });
}

function underMinimumItems(sources: InboxSources, tz: string): InboxItem[] {
  const { now } = sources;
  const items: InboxItem[] = [];
  for (const cls of classesForMinimumCheck(sources.minimumClasses, now)) {
    const minimum = cls.minimumEnrollment as number;
    const confirmed = sources.confirmedSeats.get(cls.id) ?? 0;
    if (confirmed >= minimum) continue;
    const first = firstSessionAt(cls) as Date;
    const until = ms(first) - ms(now);
    items.push({
      // Keyed on the first session, so a rescheduled class comes back.
      key: `class-under-minimum:${cls.id}:${ms(first)}`,
      kind: 'class-under-minimum',
      title: `${possessiveDay(first, now, tz)} ${cls.name}`,
      detail: `${confirmed} of ${minimum} needed · ${shortDate(first, tz)} · ${clock(first, tz)}`,
      href: `/classes/${cls.id}/roster`,
      actionLabel: 'Review',
      // It became something to do when the class came inside the window.
      occurredAt: new Date(
        ms(first) - INBOX_UNDER_MINIMUM_WINDOW_DAYS * DAY_MS
      ).toISOString(),
      dueAt: first.toISOString(),
      urgent: until <= INBOX_UNDER_MINIMUM_URGENT_DAYS * DAY_MS,
    });
  }
  return items;
}

function syncConflictItems(sources: InboxSources): InboxItem[] {
  const pending = sources.syncConflicts;
  if (pending.length === 0) return [];
  const latest = Math.max(...pending.map((c) => ms(c.detectedAt)));
  return [
    {
      key: `sync-conflicts:${pending.length}:${latest}`,
      kind: 'sync-conflicts',
      title: `${pending.length} inventory sync ${pending.length === 1 ? 'conflict' : 'conflicts'}`,
      detail: 'Square or Etsy disagrees with the portal',
      href: '/sync-conflicts',
      actionLabel: 'Review',
      occurredAt: new Date(latest).toISOString(),
      urgent: false,
    },
  ];
}

/**
 * Sort rank: failed charges, then agreements for a class within 48 hours,
 * uncleared instructors teaching within a week and classes under their
 * minimum within three days, then stale inquiries, then
 * new inquiries, then everything else.
 */
export function inboxRank(item: Pick<InboxItem, 'kind' | 'urgent'>): number {
  if (item.kind === 'charge-failed') return 0;
  if (item.kind === 'agreement-unsigned' && item.urgent) return 1;
  if (item.kind === 'instructor-not-ready' && item.urgent) return 1;
  if (item.kind === 'class-under-minimum' && item.urgent) return 1;
  if (item.kind === 'lesson-inquiry') return item.urgent ? 2 : 3;
  return 4;
}

/** Most urgent first; within a rank, soonest deadline, then longest waiting. */
export function sortInboxItems(items: ReadonlyArray<InboxItem>): InboxItem[] {
  return [...items].sort((a, b) => {
    const rank = inboxRank(a) - inboxRank(b);
    if (rank !== 0) return rank;
    if (a.dueAt && b.dueAt) return Date.parse(a.dueAt) - Date.parse(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    const age = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
    return age !== 0 ? age : a.key.localeCompare(b.key);
  });
}

/** Every item the sources call for, sorted, before dismissals. */
export function buildInboxItems(sources: InboxSources): InboxItem[] {
  const tz = sources.timeZone ?? DEFAULT_LESSON_TIME_ZONE;
  return sortInboxItems([
    ...chargeItems(sources, tz),
    ...agreementItems(sources, tz),
    ...instructorReadinessItems(sources, tz),
    ...underMinimumItems(sources, tz),
    ...inquiryItems(sources, tz),
    ...craftClubItems(sources),
    ...needsAttentionItems(sources),
    ...syncConflictItems(sources),
  ]);
}

/** Drop what someone has marked done. */
export function withoutDismissed(
  items: ReadonlyArray<InboxItem>,
  dismissedKeys: ReadonlySet<string>
): InboxItem[] {
  return items.filter((item) => !dismissedKeys.has(item.key));
}

/** A dismissal: someone marked an inbox item done. Studio-wide. */
export interface InboxDismissal {
  /** The item's `key`. */
  key: string;
  kind: InboxItemKind;
  dismissedAt: Date;
  dismissedByUid?: string;
}

/** Longest key accepted, comfortably above any key built here. */
export const INBOX_KEY_MAX_LENGTH = 400;

/** `kind:rest`, no slashes (Firestore paths), no whitespace. */
export function isWellFormedInboxKey(key: unknown): key is string {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= INBOX_KEY_MAX_LENGTH &&
    /^[a-z-]+:[^\s/]+$/.test(key)
  );
}

/** The kind a key names (every key starts with its kind), if it is a known one. */
export function inboxKindOfKey(key: string): InboxItemKind | undefined {
  const kind = key.split(':')[0];
  return kind in INBOX_KIND_LABELS ? (kind as InboxItemKind) : undefined;
}
