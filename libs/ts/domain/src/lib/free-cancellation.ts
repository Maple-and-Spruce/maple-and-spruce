/**
 * Free cancellation for class registrations.
 *
 * The published policy (mapleandsprucefolkarts.com/cancellation-policy) gives
 * a full refund to anyone who tells us at least two weeks before their class.
 * We show that as a date, the way Airbnb does at checkout: "Free cancellation
 * until Sat, Nov 21 at 10:00 AM".
 *
 * The date is shown only while it is still ahead. After it, nothing on the
 * site or in the cancel page mentions cancelling; people can still email
 * Katie as they always could.
 *
 * Music Together has its own policy and does not use this.
 */
import type { Registration } from './registration';
import { addWeeksOnWallClock } from './push-lessons-back';
import { SCHEDULE_TIME_ZONE } from './student-lesson-schedule';

/**
 * The website's cancel page (a Webflow page holding the cancel widget). One
 * Webflow site serves dev and prod, like the other manage pages.
 */
export const CANCEL_PAGE_URL = 'https://mapleandsprucefolkarts.com/cancel';

/** The cancel page with the confirmation number already filled in. */
export function cancelPageUrl(confirmationNumber?: string): string {
  return confirmationNumber
    ? `${CANCEL_PAGE_URL}?confirmation=${encodeURIComponent(confirmationNumber)}`
    : CANCEL_PAGE_URL;
}

/** How long before the class a cancellation is still fully refunded. */
export const FREE_CANCELLATION_WEEKS = 2;

/**
 * What the two weeks count back from: the hour a private group booked, or
 * the class's first session.
 */
export function cancellationAnchor(
  sessions: ReadonlyArray<{ dateTime: Date | string }>,
  slotStart?: Date | string
): Date | undefined {
  if (slotStart) return new Date(slotStart);
  let earliest: Date | undefined;
  for (const session of sessions) {
    const at = new Date(session.dateTime);
    if (Number.isNaN(at.getTime())) continue;
    if (!earliest || at < earliest) earliest = at;
  }
  return earliest;
}

/**
 * The last moment a cancellation is fully refunded: two weeks before `start`,
 * at the same clock time in the studio's timezone (so a clock change in
 * between does not move it by an hour).
 */
export function freeCancellationDeadline(
  start: Date,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date {
  return addWeeksOnWallClock(start, -FREE_CANCELLATION_WEEKS, timeZone);
}

/**
 * The free cancellation deadline, only while it is still ahead of `now`.
 * `undefined` means say nothing about cancelling.
 */
export function freeCancellationUntil(
  input: {
    sessions: ReadonlyArray<{ dateTime: Date | string }>;
    slotStart?: Date | string;
  },
  now: Date,
  timeZone: string = SCHEDULE_TIME_ZONE
): Date | undefined {
  const anchor = cancellationAnchor(input.sessions, input.slotStart);
  if (!anchor) return undefined;
  const deadline = freeCancellationDeadline(anchor, timeZone);
  return deadline.getTime() > now.getTime() ? deadline : undefined;
}

/** "Sat, Nov 21 at 10:00 AM", in the studio's timezone. */
export function formatFreeCancellationDeadline(
  deadline: Date,
  timeZone: string = SCHEDULE_TIME_ZONE
): string {
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(deadline);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(deadline);
  return `${day} at ${time}`;
}

/**
 * A cancellation request still waiting on Katie: asked for, and the
 * registration not yet cancelled or refunded.
 */
export function hasOpenCancellationRequest(
  registration: Pick<Registration, 'status' | 'cancellationRequestedAt'>
): boolean {
  return (
    registration.cancellationRequestedAt !== undefined &&
    registration.status === 'confirmed'
  );
}

/** Confirmation numbers are typed by hand: ignore case and stray spaces. */
export function normalizeConfirmationNumber(value: string): string {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '');
  return compact.startsWith('MS-') || compact.length !== 6
    ? compact
    : `MS-${compact}`;
}
