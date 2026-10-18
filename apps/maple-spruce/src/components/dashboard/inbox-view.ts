/**
 * Pure view helpers for the Home dashboard's Inbox card (#235).
 *
 * The server decides what is in the inbox and in what order
 * (`buildInboxItems`); this only turns an item into the words and colours of
 * its row. Everything takes `now`, so stories and tests read the same.
 */
import { INBOX_KIND_LABELS } from '@maple/ts/domain';
import type { InboxItem, InboxItemKind } from '@maple/ts/domain';

/** Rows shown before the footer says how many more there are. */
export const INBOX_ROW_CAP = 4;

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** How long ago: "Just now", "12 minutes ago", "2 hours ago", "Yesterday", "3 days ago". */
export function inboxAgo(occurredAt: Date, now: Date): string {
  const diff = now.getTime() - occurredAt.getTime();
  if (diff < MINUTE_MS) return 'Just now';
  if (diff < HOUR_MS) return `${plural(Math.floor(diff / MINUTE_MS), 'minute')} ago`;
  if (diff < DAY_MS) return `${plural(Math.floor(diff / HOUR_MS), 'hour')} ago`;
  if (diff < 2 * DAY_MS) return 'Yesterday';
  if (diff < 14 * DAY_MS) return `${Math.floor(diff / DAY_MS)} days ago`;
  return `${Math.floor(diff / (7 * DAY_MS))} weeks ago`;
}

/** Until a deadline: "Class in 8 hours", "Class tomorrow", "Class in 3 days". */
export function inboxUntil(dueAt: Date, now: Date): string {
  const diff = dueAt.getTime() - now.getTime();
  if (diff <= 0) return 'Class now';
  if (diff < HOUR_MS) return `Class in ${plural(Math.ceil(diff / MINUTE_MS), 'minute')}`;
  if (diff < DAY_MS) return `Class in ${plural(Math.round(diff / HOUR_MS), 'hour')}`;
  if (diff < 2 * DAY_MS) return 'Class tomorrow';
  return `Class in ${Math.round(diff / DAY_MS)} days`;
}

/** The age half of a row's eyebrow: time until a deadline, else time since. */
export function inboxAgeText(
  item: Pick<InboxItem, 'occurredAt' | 'dueAt'>,
  now: Date
): string {
  return item.dueAt
    ? inboxUntil(new Date(item.dueAt), now)
    : inboxAgo(new Date(item.occurredAt), now);
}

/** Which family of colour a row takes. */
export type InboxTone = 'inquiry' | 'failure' | 'deadline' | 'quiet';

export function inboxTone(kind: InboxItemKind): InboxTone {
  switch (kind) {
    case 'lesson-inquiry':
    case 'lesson-inquiries-older':
      return 'inquiry';
    case 'charge-failed':
    case 'invoice-sync-failed':
    case 'craft-club-past-due':
      return 'failure';
    case 'agreement-unsigned':
    case 'instructor-not-ready':
    case 'class-under-minimum':
      return 'deadline';
    default:
      return 'quiet';
  }
}

export function inboxKindLabel(kind: InboxItemKind): string {
  return INBOX_KIND_LABELS[kind] ?? kind;
}

/** The check button's accessible name: "Mark done: Charge failed, Robin · $35". */
export function inboxDoneLabel(item: Pick<InboxItem, 'kind' | 'title'>): string {
  return `Mark done: ${inboxKindLabel(item.kind)}, ${item.title}`;
}

/** The rows shown and how many are left over. */
export function visibleInboxItems<T>(
  items: ReadonlyArray<T>,
  cap = INBOX_ROW_CAP
): { rows: T[]; hidden: number } {
  return { rows: items.slice(0, cap), hidden: Math.max(0, items.length - cap) };
}

/** Footer copy; empty when nothing is hidden. */
export function inboxFooterText(hidden: number): string {
  return hidden > 0 ? `${hidden} more in the inbox` : '';
}

/** Appended to the page header's one-liner: " · 3 in the inbox". */
export function inboxSummarySuffix(count: number): string {
  return count > 0 ? ` · ${count} in the inbox` : '';
}
