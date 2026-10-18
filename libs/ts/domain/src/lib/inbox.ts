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
 *  - a class registration refunded in part (in the Square dashboard) while
 *    the student stays enrolled, for `INBOX_REFUND_LOOKBACK_DAYS`
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
import { hasOpenPartialRefund } from './registration';
import type { Registration } from './registration';
import { zonedDateKey } from './schedule-format';

export type InboxItemKind =
  | 'lesson-inquiry'
  | 'lesson-inquiries-older'
  | 'charge-failed'
  | 'craft-club-past-due'
  | 'craft-club-requested'
  | 'agreement-unsigned'
  | 'sync-conflicts'
  | 'refund-partial'
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
  'refund-partial': 'Part refund',
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
/** Unbilled and blockless lessons older than this are not chased here. */
export const INBOX_LESSON_LOOKBACK_DAYS = 14;
/** A partial refund older than this is not chased here. */
export const INBOX_REFUND_LOOKBACK_DAYS = 90;

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export interface InboxClass {
  id: string;
  name: string;
  sessions: ReadonlyArray<{ dateTime: Date }>;
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
  /**
   * Registrations with any money refunded; only open partial refunds are
   * used. Their class names come from `classes`.
   */
  refundedRegistrations: ReadonlyArray<
    Pick<
      Registration,
      | 'id'
      | 'classId'
      | 'customerName'
      | 'status'
      | 'pricePaidCents'
      | 'refundedAmountCents'
      | 'lastRefundAt'
      | 'updatedAt'
    >
  >;
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

/** Always two decimals: "$20.00 of $63.60". */
function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function partialRefundItems(sources: InboxSources): InboxItem[] {
  const lookback = ms(sources.now) - INBOX_REFUND_LOOKBACK_DAYS * DAY_MS;
  const classNames = new Map(sources.classes.map((c) => [c.id, c.name]));
  const items: InboxItem[] = [];
  for (const registration of sources.refundedRegistrations) {
    if (!hasOpenPartialRefund(registration)) continue;
    const at = registration.lastRefundAt ?? registration.updatedAt;
    if (ms(at) < lookback) continue;
    const refunded = registration.refundedAmountCents ?? 0;
    const who = registration.customerName?.trim();
    items.push({
      // The amount is in the key, so a further partial refund comes back.
      key: `refund-partial:${registration.id}:${refunded}`,
      kind: 'refund-partial',
      title: classNames.get(registration.classId) ?? 'Class registration',
      // Amount first: on a narrow card the end of the line is clipped.
      detail: [
        `${dollars(refunded)} of ${dollars(registration.pricePaidCents)} refunded in Square`,
        who,
      ]
        .filter(Boolean)
        .join(' · '),
      href: `/classes/${registration.classId}/roster`,
      actionLabel: 'Review',
      occurredAt: at.toISOString(),
      urgent: false,
    });
  }
  return items;
}

/**
 * Sort rank: failed charges, then agreements for a class within 48 hours,
 * then stale inquiries, then new inquiries, then everything else.
 */
export function inboxRank(item: Pick<InboxItem, 'kind' | 'urgent'>): number {
  if (item.kind === 'charge-failed') return 0;
  if (item.kind === 'agreement-unsigned' && item.urgent) return 1;
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
    ...inquiryItems(sources, tz),
    ...craftClubItems(sources),
    ...needsAttentionItems(sources),
    ...syncConflictItems(sources),
    ...partialRefundItems(sources),
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
